// The host: the tab that runs the town for everyone in "Play together". It holds the database lease on
// `town/host`, runs the game core compiled to WebAssembly (../solo/livera_solo.js: the same World, op dispatch and
// autopilot as the server, through protocol::LocalTown's town_* functions), and answers every person's requests:
// its own player's through a pipe in this tab, each friend's through an encrypted channel in the room (link.js).
//
// What the server keeps in SQLite, the host keeps in the artifact's database, readable and writable only by admins
// (the owner and Editors): `town/claims` (which person, by their platform id, plays which character: one each, for
// good, as one account plays one character on a server) and `town/save` (the whole world, as the solo save, gzipped
// and split into parts under the database's 256 KiB per document). People-always-win and "someone is playing that
// character" come from LocalTown; the claim checks are the host's, as they are the server's (Server::play).
//
// Time: the town ticks at real time, 10 times a second, and only while the host's tab is visible. Hidden, it stops
// (no catch-up), tells everyone, refuses what would need time to pass, and saves. Closing the tab stops the town.

import { HostEnd, randomId, pipeEvents, b64, unb64, gzipBytes, gunzipBytes } from "./link.js";

export const MAX_PEOPLE = 16;   // the server's default --max-players
export const PATHS = { host: "town/host", claims: "town/claims", save: "town/save" };
export const SAVE_FORMAT = "livera-together-save/1";
export const PAUSED_MESSAGE = "The town is paused: the host's tab is in the background. Nothing moves until they're back.";
export const STOPPED_MESSAGE = "The town has stopped: the host stopped hosting.";

const TICK_MS = 100;
const MAX_STEP_S = 1;
const AUTOSAVE_MS = 20000;
const LEASE_TTL_MS = 12000;
const LEASE_RENEW_MS = 4000;
const STATUS_MS = 5000;
// While paused, a person can still read where they are; anything that needs the town to move waits.
const WHILE_PAUSED = new Set(["look", "map"]);
// The server's per-connection limits (Server.h): requests, and speech and texts on their own bucket.
const REQUESTS_PER_SECOND = 20, REQUEST_BURST = 40, MAX_VIOLATIONS = 50;
const CHAT_PER_SECOND = 1, CHAT_BURST = 5;
const NEEDED = ["solo_new", "solo_load", "solo_save", "solo_rules", "solo_autopilot_start", "solo_autopilot_status", "town_join",
  "town_leave", "town_request", "town_tick", "town_characters", "town_create_character", "town_creator_options", "town_humans"];

const enc = new TextEncoder();
const dec = new TextDecoder();
const ok = data => ({ ok: true, data });
const fail = (code, message) => ({ ok: false, error: { code, message } });
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
// A token bucket, as src/server/RateLimiter.
class Bucket {
  constructor(rate, burst) { this.rate = rate; this.burst = burst; this.tokens = burst; this.at = performance.now(); }
  allow() {
    const t = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + (t - this.at) / 1000 * this.rate);
    this.at = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
const canGzip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

// The module is 5 MB; a page that stops hosting and hosts again reuses it.
let modulePromise = null;

// ------------------------------------------------------------------ the save in the database

// The world document as parts small enough for the database (256 KiB a document): gzipped and base64'd where the
// browser can, checked with SHA-256 so parts of two different saves never load as one.
export async function encodeSave(text) {
  const raw = enc.encode(text);
  const sha256 = hex(await crypto.subtle.digest("SHA-256", raw));
  const split = (s, n) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : [""]; };
  if (canGzip()) return { enc: "gzip-base64", parts: split(b64(await gzipBytes(raw)), 200000), bytes: raw.length, sha256 };
  // JSON escaping can double a quote-heavy part; 100,000 characters stays under the limit.
  return { enc: "json", parts: split(text, 100000), bytes: raw.length, sha256 };
}
export async function decodeSave(meta, parts) {
  const joined = parts.join("");
  let raw;
  if (meta.enc === "gzip-base64") raw = await gunzipBytes(unb64(joined), 64 << 20);
  else if (meta.enc === "json") raw = enc.encode(joined);
  else throw new Error(`unknown save encoding "${String(meta.enc).slice(0, 20)}"`);
  if (raw.length !== meta.bytes || hex(await crypto.subtle.digest("SHA-256", raw)) !== meta.sha256)
    throw new Error("its parts don't belong together (an interrupted save?)");
  return dec.decode(raw);
}

// ------------------------------------------------------------------ the host

export class TownHost {
  // db, room: the platform's namespaces. uid: this person's id (user.id()). myPeer: this tab's room label.
  // keyPair/publicKey: this tab's (link.js). pacer: this page's one pacer. onChange(): something to redraw.
  constructor({ db, room, uid, myPeer, keyPair, publicKey, pacer, tabId, moduleUrl, onChange }) {
    this.db = db; this.room = room; this.uid = uid; this.myPeer = myPeer;
    this.keyPair = keyPair; this.publicKey = publicKey; this.pacer = pacer;
    this.tabId = tabId || randomId(6);
    this.moduleUrl = moduleUrl || new URL("../solo/livera_solo.js", import.meta.url).href;
    this.onChange = onChange || (() => {});
    this.M = null;
    this.running = false; this.leaseLost = false; this.stopReason = null;
    this.epoch = null; this.holder = null;
    this.claims = new Map();        // uid -> {character, at}
    this.sessions = new Map();      // key -> {key, uid, peer, kind, push, character, link}
    this.localPipes = new Set();
    this.paused = false; this.pausedAt = 0;
    this.last = null; this.ticks = 0; this.gameSeconds = 0;
    this.timers = [];
    this.hostChain = Promise.resolve(); this.claimsWriting = false; this.claimsDirty = false;
    this.saveChain = Promise.resolve(); this.savesQueued = 0; this.saveSlot = null;
    this.lastSave = null; this.lastSaveError = null; this.saves = 0;
    this.from = null;
    this.stats = { requests: 0, kicked: 0 };
    this.onVisibility = () => this.setHidden(document.hidden);
    this.onPageHide = e => { if (e.persisted) this.setHidden(true); else this.stop({ reason: "closed" }); };
  }

  // ------------------------------------------------------------------ starting and stopping
  async loadModule() {
    if (this.M) return;
    if (!modulePromise) {
      modulePromise = import(this.moduleUrl).then(async mod => {
        const create = typeof mod.default === "function" ? mod.default : mod.createLivera;
        if (typeof create !== "function") throw new Error("livera_solo.js exports no createLivera()");
        const M = await create();
        for (const name of NEEDED) if (typeof M[name] !== "function") throw new Error(`the game module has no ${name}() (rebuild it with scripts/build_wasm.sh)`);
        return M;
      });
    }
    try { this.M = await modulePromise; } catch (e) { modulePromise = null; throw e; }
  }
  call(name, ...args) { return JSON.parse(this.M[name](...args)); }

  // Takes the lease, loads the town (or founds one when the database has none) and starts serving.
  // `fresh`: found a new town even though a save exists (the person confirmed replacing it).
  async start({ fresh = false } = {}) {
    try { await this.loadModule(); } catch (e) { return fail("no_module", `The game core didn't load: ${e.message || e}`); }
    this.epoch = randomId(9);
    this.holder = `${this.uid}|${this.tabId}`;
    let got;
    try {
      got = await this.lease({ state: "starting", holder: this.holder, uid: this.uid, peer: this.myPeer, epoch: this.epoch, pub: this.publicKey,
        since: new Date().toISOString(), paused: false, max_people: MAX_PEOPLE });
    } catch (e) { return fail("no_lease", `Couldn't take the town: ${e.message || e.code || e}`); }
    if (!got.acquired) {
      const until = got.expiresAt ? new Date(got.expiresAt).toLocaleTimeString() : "soon";
      return fail("host_busy", `Someone else is hosting, or just was: their hold on the town runs out at ${until}.`);
    }
    try {
      const claims = await this.db.doc(PATHS.claims).get();
      const stored = claims.exists && claims.data() && typeof claims.data().claims === "object" ? claims.data().claims : {};
      this.claims = new Map();
      for (const [uid, c] of Object.entries(stored || {})) if (c && typeof c.character === "string") this.claims.set(uid, { character: c.character, at: c.at || null });
      let save = null;
      if (!fresh) {
        try { save = await this.readSave(); } catch (e) {
          // A database that didn't answer is not a broken save: never offer to replace the town over a hiccup.
          if (e && typeof e.code === "string") { await this.abandon("db_error"); return fail("db_unavailable", `Couldn't read the saved town from the database (${e.code}). Nothing was changed; try again in a moment.`); }
          await this.abandon("unreadable");
          return fail("save_unreadable", `The saved town can't be loaded: ${e.message}. Nothing was changed.`);
        }
      }
      if (save) {
        const r = this.call("solo_load", save.text);
        if (!r.ok) { await this.abandon("unreadable"); return fail("save_unreadable", `The saved town can't be loaded: ${r.error.message}. Nothing was changed.`); }
        this.saveSlot = save.meta.slot;
        this.lastSave = { at: Date.parse(save.meta.saved_at) || Date.now(), how: "loaded", bytes: save.meta.bytes, parts: save.meta.parts };
        this.from = "save";
      } else {
        const r = this.call("solo_new");
        if (!r.ok) { await this.abandon("found_failed"); return fail("found_failed", `Couldn't found a town: ${r.error.message}`); }
        this.from = "new";
        // A new town on purpose: the old claims were for the old one.
        if (fresh) this.claims.clear();
      }
      // A claim on a character this world doesn't have (made after the last save) can't be kept.
      const known = new Set(this.roster().map(c => c.id));
      for (const [uid, c] of [...this.claims]) if (!known.has(c.character)) this.claims.delete(uid);
      if (fresh || this.from === "save") this.persistClaims();
      this.startAutopilot();
      this.rules = this.call("solo_rules");
    } catch (e) {
      await this.abandon("failed");
      return fail("start_failed", `The town couldn't start: ${e.message || e.code || e}`);
    }
    this.running = true;
    this.end = new HostEnd({
      room: this.room, pacer: this.pacer, keyPair: this.keyPair, epoch: this.epoch,
      onOpen: link => { this.openSession({ key: link.peer, uid: link.uid, peer: link.peer, kind: "room", link, push: item => this.end.push(link.peer, item) }); },
      onItems: (link, items) => { const s = this.sessions.get(link.peer); if (s && s.link === link) for (const item of items) this.handle(s, item); },
      onClose: link => { const s = this.sessions.get(link.peer); if (s && s.link === link) this.endSession(s, "closed"); },
    });
    this.end.start();
    this.paused = !!document.hidden;
    if (this.paused) this.pausedAt = Date.now();
    await this.updateHostDoc({ state: "hosting", paused: this.paused });
    this.timers.push(setInterval(() => this.step(), TICK_MS));
    this.timers.push(setInterval(() => this.renew(), LEASE_RENEW_MS));
    this.timers.push(setInterval(() => { if (!this.paused) this.save("auto"); }, AUTOSAVE_MS));
    this.timers.push(setInterval(() => this.broadcast(), STATUS_MS));
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    this.broadcast();
    // A new town is saved at once, so it survives the host closing the tab straight away.
    if (this.from === "new") this.save("founded");
    this.changed();
    return ok({ from: this.from });
  }

  // The lease was taken but the town didn't start: say so and let the next host in.
  async abandon(reason) {
    await this.updateHostDoc({ state: "stopped", reason, stopped_at: new Date().toISOString() });
    await this.hostWrite(() => this.db.doc(PATHS.host).acquire({ holder: this.holder, ttlMs: 1000 })).catch(() => {});
  }

  // Stops serving: saves (unless another tab took over), tells everyone, marks the town stopped and shortens the
  // lease to a second so another admin's page can take over (handover). `reason`: "stopped" (the menu), "closed".
  async stop({ reason = "stopped" } = {}) {
    if (!this.running) return;
    this.running = false; this.stopReason = reason;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    this.end.status({ stopping: true, reason, paused: true, people: 0 });
    for (const s of this.sessions.values()) if (s.kind === "self") s.push({ k: "status", status: { stopping: true, reason, paused: true } });
    try {
      if (!this.leaseLost) {
        await this.save("stop");
        await this.updateHostDoc({ state: "stopped", reason, stopped_at: new Date().toISOString(), paused: false });
        await this.hostWrite(() => this.db.doc(PATHS.host).acquire({ holder: this.holder, ttlMs: 1000 })).catch(() => {});
      }
    } finally {
      this.shutDown(reason);
    }
  }

  // Another tab holds the lease now (ours ran out while this tab was throttled or offline): stop at once, save
  // nothing (its save is the newer one).
  lose(reason) {
    if (this.leaseLost) return;
    this.leaseLost = true;
    if (!this.running) return;
    this.running = false; this.stopReason = reason;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    this.shutDown(reason);
  }

  shutDown(reason) {
    if (this.end) this.end.stop();
    for (const s of [...this.sessions.values()]) this.endSession(s, reason);
    for (const pipe of [...this.localPipes]) pipe.ended(reason);
    this.changed();
  }

  // ------------------------------------------------------------------ the lease and the host document
  // One write at a time to town/host, as the database asks.
  hostWrite(fn) { const p = this.hostChain.then(fn, fn); this.hostChain = p.catch(() => {}); return p; }
  lease(data) { return this.hostWrite(() => this.db.doc(PATHS.host).acquire({ holder: this.holder, ttlMs: LEASE_TTL_MS, ...(data ? { data } : {}) })); }
  async renew() {
    if (this.leaseLost) return false;
    try {
      const r = await this.lease();
      if (!r.acquired) { this.lose("lease_lost"); return false; }
      return true;
    } catch (e) {
      // The database is unreachable: no other tab can take the lease either, so keep going.
      console.warn("together: couldn't renew the host lease", e);
      return true;
    }
  }
  updateHostDoc(fields) {
    return this.hostWrite(() => this.db.doc(PATHS.host).update(fields)).catch(e => console.warn("together: couldn't update town/host", e));
  }

  // ------------------------------------------------------------------ claims
  claimOf(uid) { const c = this.claims.get(uid); return c ? c.character : null; }
  ownerOf(character) { for (const [uid, c] of this.claims) if (c.character === character) return uid; return null; }
  setClaim(uid, character) { this.claims.set(uid, { character, at: new Date().toISOString() }); this.persistClaims(); }
  async persistClaims() {
    if (this.claimsWriting) { this.claimsDirty = true; return; }
    this.claimsWriting = true;
    try {
      do {
        this.claimsDirty = false;
        const claims = Object.fromEntries([...this.claims].map(([uid, c]) => [uid, { character: c.character, at: c.at }]));
        await this.db.doc(PATHS.claims).set({ claims, updated_at: new Date().toISOString() });
      } while (this.claimsDirty);
    } catch (e) { console.warn("together: couldn't save the claims", e); } finally { this.claimsWriting = false; }
  }
  // The host's own "--release-character": the person may pick again; a founder goes back on autopilot.
  releaseClaim(uid) {
    const c = this.claims.get(uid);
    if (!c) return fail("no_claim", "they have no character in this town");
    if ([...this.sessions.values()].some(s => s.character === c.character)) return fail("character_in_use", "they're in the town right now; they keep the character until they leave");
    this.claims.delete(uid);
    this.persistClaims();
    const def = this.roster().find(x => x.id === c.character);
    if (def && !def.created) this.call("solo_autopilot_start", JSON.stringify([c.character]));
    this.changed();
    return ok({ released: c.character });
  }
  claimList() { return [...this.claims].map(([uid, c]) => ({ uid, character: c.character, at: c.at, playing: [...this.sessions.values()].some(s => s.character === c.character) })); }

  roster() { const r = this.call("town_characters", null); return r.ok ? r.data.characters : []; }
  // Founders nobody has claimed live their day on autopilot (as the server's --autopilot does).
  startAutopilot() {
    const claimed = new Set([...this.claims.values()].map(c => c.character));
    const ids = this.roster().filter(c => !c.created && !claimed.has(c.id)).map(c => c.id);
    this.call("solo_autopilot_start", JSON.stringify(ids));
  }

  // ------------------------------------------------------------------ sessions: one per open page
  openSession({ key, uid, peer, kind, push, link = null }) {
    const s = { key, uid, peer, kind, push, link, character: null, opened: Date.now(),
      limiter: new Bucket(REQUESTS_PER_SECOND, REQUEST_BURST), chat: new Bucket(CHAT_PER_SECOND, CHAT_BURST), violations: 0 };
    this.sessions.set(key, s);
    s.push(this.welcome());
    this.changed();
    return s;
  }
  welcome() {
    return { k: "welcome", protocol: "livera/1", build: "together", rules: this.rules,
      town: { epoch: this.epoch, paused: this.paused, max_people: MAX_PEOPLE, from: this.from } };
  }
  endSession(s, reason) {
    if (this.sessions.get(s.key) !== s) return;
    this.sessions.delete(s.key);
    if (s.character) this.leaveTown(s);
    this.changed();
  }
  // They go dormant where they are, as on logout. Everyone here has a claim, so nobody goes back on autopilot.
  leaveTown(s) {
    if (this.M) this.call("town_leave", JSON.stringify({ character: s.character, autopilot: false }));
    s.character = null;
    this.changed();
  }
  people() { let n = 0; for (const s of this.sessions.values()) if (s.character) n++; return n; }

  handle(s, item) {
    if (!item || typeof item !== "object" || s.flooded) return;
    if (item.k === "req") {
      const id = item.id ?? null;
      // The server's limits, in its order: every request, then speech and texts on their own bucket.
      if (!s.limiter.allow()) {
        if (++s.violations > MAX_VIOLATIONS) { this.dropForFlooding(s); return; }
        s.push({ k: "rep", id, ...fail("rate_limited", "slow down") });
        return;
      }
      if (["say", "message", "post", "comment"].includes(item.op) && !s.chat.allow()) { s.push({ k: "rep", id, ...fail("chat_rate_limited", "you're talking too fast") }); return; }
      s.push({ k: "rep", id, ...this.answer(s, item.op, item.args) });
    } else if (item.k === "bye") this.endSession(s, "bye");
  }

  // As the server closes a connection that keeps flooding it: out of the town, and told why.
  dropForFlooding(s) {
    if (s.flooded) return;
    s.flooded = true;
    this.stats.kicked++;
    s.push({ k: "ev", event: "kicked", data: { reason: "too many requests" } });
    if (s.character) this.leaveTown(s);
    // A moment for the notice to go out, then the channel closes.
    setTimeout(() => { if (s.link && this.end) this.end.drop(s.peer, "rate limit"); else this.endSession(s, "rate limit"); }, 2000);
  }

  // One request from one person: the server's session ops here, every in-world op through LocalTown.
  answer(s, op, args) {
    if (typeof op !== "string" || !op || op.length > 40) return fail("bad_request", "expected {\"op\": ...}");
    const a = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
    delete a.id; delete a.op;   // `id` is reserved for matching (protocol rule)
    this.stats.requests++;
    if (!this.running) return fail("town_stopped", STOPPED_MESSAGE);
    try {
      switch (op) {
        case "hello": return ok({ protocol: "livera/1", build: "together", rules: this.rules });
        case "ping": return ok({ pong: true });
        case "register": case "login": case "resume": case "logout_everywhere":
          return fail("unknown_op", "A shared town has no accounts: you are who this page says you are.");
        case "characters": return this.characters(s);
        case "creator_options": return this.reply(this.call("town_creator_options"));
        case "create_character": return this.createCharacter(s, a);
        case "play": return this.play(s, a);
        case "logout": if (s.character) this.leaveTown(s); return ok({ logged_out: true });
        case "dev_advance": case "dev_condition": return fail("forbidden", "Time skips and dev commands are off in a shared town.");
        default: {
          if (!s.character) return fail("not_playing", "choose a character first");
          if (this.paused && !WHILE_PAUSED.has(op)) return fail("town_paused", PAUSED_MESSAGE);
          const r = this.call("town_request", s.character, JSON.stringify({ id: 0, op, ...a }));
          return r.ok ? ok(r.data ?? {}) : { ok: false, error: r.error };
        }
      }
    } catch (e) {
      return fail("internal", String((e && e.message) || e));
    }
  }
  reply(r) { return r && r.ok ? ok(r.data ?? {}) : { ok: false, error: (r && r.error) || { code: "internal", message: "no answer" } }; }

  // The pick list as the server gives it: the town's people, plus your own made character; others' made characters aren't
  // listed. `available` is false for a character someone else has claimed or is playing.
  characters(s) {
    const mine = this.claimOf(s.uid);
    const r = this.call("town_characters", s.character || mine || null);
    if (!r.ok) return r;
    const list = r.data.characters.filter(c => !c.created || this.ownerOf(c.id) === s.uid).map(c => {
      const owner = this.ownerOf(c.id);
      return { ...c, available: (!owner || owner === s.uid) && (c.available || c.id === s.character), yours: owner === s.uid };
    });
    return ok({ characters: list, can_create: !mine, yours: mine, people: this.people(), max_people: MAX_PEOPLE });
  }

  createCharacter(s, a) {
    if (this.paused) return fail("town_paused", PAUSED_MESSAGE);
    if (this.claimOf(s.uid)) return fail("already_has_character", "you already have a character in this town");
    if (!a.character || typeof a.character !== "object" || Array.isArray(a.character)) return fail("bad_request", "send your character sheet as \"character\"");
    const r = this.call("town_create_character", JSON.stringify(a.character));
    if (!r.ok) return r;
    this.setClaim(s.uid, r.data.id);
    // Saved now, so the claim never points at a character the save doesn't have (as the server does).
    this.save("created");
    return ok(r.data);
  }

  // Server::play, with the claims kept here: refusals in the server's order and words.
  play(s, a) {
    if (s.character) return fail("already_playing", "already in the world");
    if (this.paused) return fail("town_paused", PAUSED_MESSAGE);
    const mine = this.claimOf(s.uid);
    const id = typeof a.character === "string" && a.character ? a.character : mine || "";
    const def = this.roster().find(c => c.id === id);
    if (!def) return fail("unknown_character", "that character can't be played");
    const owner = this.ownerOf(id);
    if (owner && owner !== s.uid) return fail("character_taken", "someone else is playing that character");
    if (mine && mine !== id) return fail("already_has_character", `you already play ${this.nameOf(mine)} in this town`);
    // The same person in another tab: the newer page wins, as a second login does on the server.
    for (const other of this.sessions.values()) {
      if (other !== s && other.uid === s.uid && other.character) {
        other.push({ k: "ev", event: "kicked", data: { reason: "playing in another tab" } });
        this.leaveTown(other);
        this.stats.kicked++;
      }
    }
    if (this.people() >= MAX_PEOPLE) return fail("server_full", `The town is full (${MAX_PEOPLE} people).`);
    const j = this.call("town_join", id);
    if (!j.ok) return j;
    s.character = id;
    if (!mine) this.setClaim(s.uid, id);
    this.changed();
    return ok(j.data);
  }
  nameOf(id) { const c = this.roster().find(x => x.id === id); return c ? c.name : id; }

  // ------------------------------------------------------------------ time
  step() {
    if (!this.running || this.paused) { this.last = null; return; }
    const t = performance.now();
    const dt = this.last === null ? 0 : Math.min(MAX_STEP_S, (t - this.last) / 1000);
    this.last = t;
    if (dt > 0) this.advance(dt);
  }
  // Moves the town on by `seconds` of real time in steps of at most 1 s and hands each person their events.
  // The timer uses it for the elapsed slice; the tests use it (window.__liveraTogether) to fast-forward.
  advance(seconds) {
    if (!this.running) return;
    let left = Math.min(Number(seconds) || 0, 600);
    while (left > 1e-9) {
      const step = Math.min(MAX_STEP_S, left);
      left -= step;
      const out = this.call("town_tick", step);
      this.ticks++; this.gameSeconds += step;
      for (const s of this.sessions.values()) {
        const list = s.character && out[s.character];
        if (Array.isArray(list)) for (const ev of list) if (ev && typeof ev.event === "string") s.push({ k: "ev", event: ev.event, data: ev.data });
      }
    }
  }

  setHidden(hidden) {
    if (!this.running || hidden === this.paused) return;
    this.paused = hidden; this.last = null;
    if (hidden) this.pausedAt = Date.now();
    this.broadcast();
    this.updateHostDoc({ paused: hidden });
    if (hidden) this.save("hidden");
    this.changed();
  }
  // What everyone may know about the town, in the clear: paused or not, and how many people are in it.
  broadcast() {
    if (!this.running) return;
    const status = { paused: this.paused, reason: this.paused ? "host_hidden" : "", people: this.people() };
    this.end.status(status);
    for (const s of this.sessions.values()) if (s.kind === "self") s.push({ k: "status", status });
  }

  // ------------------------------------------------------------------ saving
  // Saves are queued one after another (one write at a time per document); an autosave behind another save is dropped.
  save(how = "auto") {
    if (!this.M || this.leaseLost) return Promise.resolve(false);
    if (how === "auto" && this.savesQueued > 0) return Promise.resolve(false);
    this.savesQueued++;
    const run = () => this.saveNow(how).finally(() => { this.savesQueued--; });
    const p = this.saveChain.then(run, run);
    this.saveChain = p.catch(() => false);
    return p;
  }
  async saveNow(how) {
    if (this.leaseLost || (!this.running && how !== "stop")) return false;
    const t0 = performance.now();
    try {
      const text = this.M.solo_save();
      if (text.startsWith("{\"ok\":false")) throw new Error(JSON.parse(text).error.message);
      // Still the host? If another tab holds the lease, its save is the newer one: never write over it.
      if (how !== "stop" && !(await this.renew())) return false;
      const packed = await encodeSave(text);
      const slot = this.saveSlot === "a" ? "b" : "a";
      // The parts go to the slot not in use; the manifest moves over last, so an interrupted save leaves the
      // previous one whole.
      for (let i = 0; i < packed.parts.length; i++) await this.db.doc(`${PATHS.save}/${slot}/${i}`).set({ i, d: packed.parts[i] });
      const savedAt = new Date().toISOString();
      await this.db.doc(PATHS.save).set({ format: SAVE_FORMAT, saved_at: savedAt, slot, parts: packed.parts.length, enc: packed.enc,
        bytes: packed.bytes, sha256: packed.sha256, epoch: this.epoch, host: this.uid });
      this.saveSlot = slot; this.saves++;
      this.lastSave = { at: Date.now(), how, bytes: packed.bytes, parts: packed.parts.length, ms: Math.round(performance.now() - t0) };
      this.lastSaveError = null;
      this.updateHostDoc({ saved_at: savedAt });
      this.changed();
      return true;
    } catch (e) {
      this.lastSaveError = String((e && (e.message || e.code)) || e);
      console.warn("together: couldn't save the town", e);
      this.changed();
      return false;
    }
  }
  async readSave() {
    const m = await this.db.doc(PATHS.save).get();
    if (!m.exists) return null;
    const meta = m.data() || {};
    if (meta.format !== SAVE_FORMAT || (meta.slot !== "a" && meta.slot !== "b") || !isInt(meta.parts, 1, 1000) || !isInt(meta.bytes, 0, 2 ** 31))
      throw new Error("it isn't a save this page knows");
    const parts = [];
    for (let i = 0; i < meta.parts; i++) {
      const p = await this.db.doc(`${PATHS.save}/${meta.slot}/${i}`).get();
      const d = p.exists && p.data();
      if (!d || typeof d.d !== "string") throw new Error(`part ${i + 1} of ${meta.parts} is missing`);
      parts.push(d.d);
    }
    return { meta, text: await decodeSave(meta, parts) };
  }

  // ------------------------------------------------------------------ the host's own player
  // A pipe like a friend's (transport_room.js can't tell them apart), straight into this object.
  localPipe() {
    const ev = pipeEvents();
    let session = null, closed = false;
    const pipe = {
      onItem: ev.onItem, onState: ev.onState,
      open: () => queueMicrotask(() => {
        if (closed) return;
        if (!this.running) { ev.state({ state: "closed", reason: this.stopReason || "not_hosting" }); return; }
        session = this.openSession({ key: `self:${randomId(4)}`, uid: this.uid, peer: this.myPeer, kind: "self",
          push: item => queueMicrotask(() => { if (!closed) ev.item(item); }) });
        ev.state({ state: "open" });
      }),
      send: item => queueMicrotask(() => { if (!closed && session && this.sessions.get(session.key) === session) this.handle(session, item); }),
      close: () => { if (closed) return; closed = true; this.localPipes.delete(pipe); if (session) this.endSession(session, "closed"); },
      ended: reason => { if (closed) return; closed = true; this.localPipes.delete(pipe); ev.state({ state: "closed", reason }); },
      stats: () => null,
    };
    this.localPipes.add(pipe);
    return pipe;
  }

  changed() { try { this.onChange(); } catch (e) { console.warn("together: onChange failed", e); } }
}
