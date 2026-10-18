// The local transport: the interface transport.js gives the rest of the client (request(op, args)
// always resolving to {ok, data} or {ok: false, error: {code, message}}; `welcome`, `event` and
// `status` listeners; status "open" while usable), backed by the game core compiled to
// WebAssembly (./livera_solo.js, built by scripts/build_wasm.sh) instead of a WebSocket. The
// whole world runs in this tab: the same World, the same op dispatch as the server
// (src/protocol/WorldOps.cpp), the same replies and error codes.
//
// Pre-play ops go to the harness's own functions (characters, create_character, play, logout;
// hello and ping are answered here); every other op is one solo_request. A 10 Hz timer advances
// the world by the real seconds elapsed (at most 1 s a step, like the server) and hands the
// events addressed to the player to the same listeners the live client uses. While the tab is
// hidden the clock stops and nothing catches up.

const TICK_MS = 100;
const MAX_STEP_S = 1;

// The harness functions, with the argument types a C export would take (embind exports take the
// same values directly).
const API = {
  solo_new: [], solo_load: ["string"], solo_save: [], solo_rules: [], solo_characters: [],
  solo_create_character: ["string"], solo_play: ["string"], solo_leave: [], solo_request: ["string"],
  solo_tick: ["number"], solo_autopilot_start: ["string"], solo_autopilot_stop: [],
  solo_creator_options: [],   // optional: used only if `creator_options` isn't routed by solo_request
  solo_autopilot_status: [],  // optional: what each autopilot character is up to (the debug hook)
};

export class LocalTransport {
  constructor({ moduleUrl = "./livera_solo.js" } = {}) {
    this.moduleUrl = moduleUrl;
    this.listeners = new Map();
    this.status = "idle";
    this.welcome = null;
    this.ws = null;            // the live client peeks at this; there is no socket here
    this.M = null;             // the wasm Module once loaded
    this.api = null;
    this.worldLoaded = false;
    this.playing = null;       // the character the person plays, once `play` succeeded
    this.autopilot = { running: false, error: null };
    this.timer = null; this.last = null; this.hiddenAt = null;
    this.ticks = 0; this.gameSeconds = 0;
    this.nextId = 1;
    this.lastError = null;
    this.onVisibility = () => this.visibility();
  }

  on(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); return () => this.listeners.get(name).delete(fn); }
  emit(name, data) { for (const fn of this.listeners.get(name) || []) { try { fn(data); } catch (e) { console.warn("listener failed", name, e); } } }
  setStatus(s, detail) { this.status = s; this.emit("status", { status: s, detail }); }

  // No accounts, no tokens: the live client's calls are harmless no-ops here.
  get token() { return null; }
  saveToken() {}
  clearToken() {}
  halt() {}
  resumeReconnecting() {}

  // Loads the module once; `status` becomes "open" (then `welcome`), or "failed" with the reason.
  async connect() {
    if (this.M || this.status === "loading") return;
    this.setStatus("loading");
    try {
      const mod = await import(this.moduleUrl);
      const create = typeof mod.default === "function" ? mod.default : mod.createLivera;
      if (typeof create !== "function") throw new Error("livera_solo.js exports no createLivera()");
      this.M = await create();
      this.api = bindApi(this.M);
      for (const name of ["solo_new", "solo_load", "solo_save", "solo_characters", "solo_play", "solo_leave", "solo_request", "solo_tick"]) {
        if (!this.api[name]) throw new Error(`the solo build has no ${name}()`);
      }
    } catch (e) {
      this.M = null; this.api = null;
      this.setStatus("failed", { message: String((e && e.message) || e) });
      return;
    }
    const rules = this.api.solo_rules ? this.reply("solo_rules") : { ok: false };
    this.welcome = { protocol: "livera/1", build: "solo", rules: rules.ok ? rules.data : undefined };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.setStatus("open");
    this.emit("welcome", this.welcome);
    this.emit("event", { event: "welcome", data: this.welcome });
  }

  // ------------------------------------------------------------------ calling the harness
  raw(name, ...args) {
    const f = this.api && this.api[name];
    if (!f) throw new Error(`the solo build has no ${name}()`);
    return f(...args);
  }
  // Harness functions answer in JSON: a reply shaped like the server's ({ok, data | error}), or the
  // data itself. Either way the caller gets the transport's {ok, data} / {ok: false, error}.
  reply(name, ...args) {
    let text;
    try { text = this.raw(name, ...args); } catch (e) {
      this.lastError = String((e && e.message) || e);
      return fail("solo_error", `${name}: ${this.lastError}`);
    }
    return normalize(text, name);
  }

  // ------------------------------------------------------------------ the town's lifecycle (solo.js)
  newTown() {
    const r = this.reply("solo_new");
    if (r.ok) this.worldLoaded = true;
    return r;
  }
  loadTown(stateJson) {
    const r = this.reply("solo_load", typeof stateJson === "string" ? stateJson : JSON.stringify(stateJson));
    if (r.ok) this.worldLoaded = true;
    return r;
  }
  // The whole world as the harness writes it (an object with `format`), or null with lastError set.
  saveTown() {
    let text;
    try { text = this.raw("solo_save"); } catch (e) { this.lastError = String((e && e.message) || e); return null; }
    let v;
    try { v = typeof text === "string" ? JSON.parse(text) : text; } catch { this.lastError = "the save isn't JSON"; return null; }
    if (!v || typeof v !== "object") { this.lastError = "the save is empty"; return null; }
    if (v.ok === false) { this.lastError = normError(v.error).message; return null; }
    if (v.ok === true && v.data && typeof v.data === "object") v = v.data;
    return v;
  }
  startAutopilot(ids = null) {
    if (!this.api.solo_autopilot_start) { this.autopilot = { running: false, error: "this build has no autopilot" }; return this.autopilot; }
    const r = this.reply("solo_autopilot_start", ids ? JSON.stringify(ids) : "null");
    this.autopilot = r.ok ? { running: true, error: null } : { running: false, error: r.error.message };
    return this.autopilot;
  }
  autopilotStatus() { return this.api.solo_autopilot_status ? this.reply("solo_autopilot_status") : fail("unavailable", "this build has no solo_autopilot_status"); }
  stopAutopilot() {
    if (this.api.solo_autopilot_stop) this.reply("solo_autopilot_stop");
    this.autopilot = { running: false, error: null };
  }

  // ------------------------------------------------------------------ requests
  async request(op, args = {}) {
    if (!this.M) return fail("disconnected", "the town hasn't loaded");
    const body = { ...args };
    delete body.id; delete body.op;   // `id` is reserved for matching (protocol rule)
    switch (op) {
      case "hello": return ok({ protocol: this.welcome.protocol, build: "solo", rules: this.welcome.rules });
      case "ping": return ok({ pong: true });
      case "resume": return fail("no_token", "");
      case "register": case "login": return fail("unknown_op", "the single-player build has no accounts");
      case "characters": return this.reply("solo_characters");
      case "create_character":
        if (!body.character || typeof body.character !== "object") return fail("bad_request", "send your character sheet as \"character\"");
        return this.reply("solo_create_character", JSON.stringify(body.character));
      case "play": {
        const id = typeof body.character === "string" ? body.character : "";
        if (!id) return fail("bad_request", "say which character to play");
        if (!this.worldLoaded) return fail("no_world", "start a new town or continue a save first");
        const r = this.reply("solo_play", id);
        if (r.ok) {
          this.playing = id;
          // Everyone the person doesn't play lives their day; the page shows them as scripted.
          this.startAutopilot();
          this.startTicking();
        }
        return r;
      }
      case "logout": {
        this.stopTicking();
        if (this.playing) this.reply("solo_leave");
        this.playing = null;
        return ok({ logged_out: true });
      }
      case "creator_options": {
        // A pre-play op on the server, so the in-world dispatch may not know it: then the
        // harness's own function answers, if the build has one.
        const r = this.reply("solo_request", JSON.stringify({ id: this.nextId++, op }));
        if (r.ok || !["unknown_op", "not_playing"].includes(r.error.code)) return r;
        if (this.api.solo_creator_options) return this.reply("solo_creator_options");
        return fail("no_creator", "this build can't make characters yet (no solo_creator_options in livera_solo.js)");
      }
      default:
        return this.reply("solo_request", JSON.stringify({ id: this.nextId++, op, ...body }));
    }
  }

  // ------------------------------------------------------------------ time
  startTicking() { if (this.timer) return; this.last = null; this.timer = setInterval(() => this.step(), TICK_MS); }
  stopTicking() { clearInterval(this.timer); this.timer = null; this.last = null; }
  step() {
    if (document.hidden) { this.last = null; return; }   // paused; when the tab is back, it goes on from here
    const now = performance.now();
    const dt = this.last === null ? 0 : Math.min(MAX_STEP_S, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.advance(dt);
  }
  // Moves the world on by `seconds` of real time in steps of at most 1 s, dispatching the events.
  // The tests use it to fast-forward; the timer uses it for the elapsed slice.
  advance(seconds) {
    if (!this.playing) return;
    let left = Number(seconds) || 0;
    while (left > 1e-9) {
      const s = Math.min(MAX_STEP_S, left);
      left -= s;
      const r = this.reply("solo_tick", s);
      this.ticks++; this.gameSeconds += s;
      if (!r.ok) { console.warn("solo_tick failed", r.error); return; }
      const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data.events) ? r.data.events : [];
      for (const ev of list) if (ev && typeof ev.event === "string") this.emit("event", ev);
    }
  }
  visibility() {
    if (document.hidden) { this.hiddenAt = performance.now(); this.last = null; return; }
    const hiddenMs = this.hiddenAt === null ? 0 : performance.now() - this.hiddenAt;
    this.hiddenAt = null; this.last = null;
    this.setStatus("open", { resumed: true, hiddenMs });
  }
}

// The harness as plain functions: embind exports are called as they are; C exports
// (EMSCRIPTEN_KEEPALIVE, UTF-8 strings in and out) get their string arguments on the wasm heap.
// Not ccall: it puts string arguments on the wasm stack (64 KB by default), and a save is bigger
// than that, which overflowed the stack and crashed the tab on `solo_load`. The reply points at
// the harness's own buffer (overwritten by the next call), so it is copied out at once.
function bindApi(M) {
  const api = {};
  const heap = typeof M._malloc === "function" && typeof M._free === "function" && typeof M.stringToUTF8 === "function" && typeof M.lengthBytesUTF8 === "function" && typeof M.UTF8ToString === "function";
  for (const [name, types] of Object.entries(API)) {
    if (typeof M[name] === "function") { api[name] = (...a) => M[name](...a); continue; }
    const f = M["_" + name];
    if (typeof f !== "function") continue;
    if (heap) {
      api[name] = (...a) => {
        const ptrs = [];
        try {
          const args = a.map((v, i) => {
            if (types[i] !== "string") return Number(v);
            const text = v === null || v === undefined ? "null" : String(v);
            const n = M.lengthBytesUTF8(text) + 1, p = M._malloc(n);
            if (!p) throw new Error("out of memory for the request");
            M.stringToUTF8(text, p, n); ptrs.push(p);
            return p;
          });
          const out = f(...args);
          return typeof out === "number" ? (out ? M.UTF8ToString(out) : "") : out;
        } finally { for (const p of ptrs) M._free(p); }
      };
    } else if (typeof M.ccall === "function") api[name] = (...a) => M.ccall(name, "string", types, a);
  }
  return api;
}

const ok = data => ({ ok: true, data });
const fail = (code, message) => ({ ok: false, error: { code, message } });
function normError(e) {
  if (typeof e === "string") return { code: e, message: e };
  if (!e || typeof e !== "object") return { code: "error", message: "the game refused" };
  return { code: String(e.code || "error"), message: String(e.message || e.code || "the game refused") };
}
function normalize(text, name) {
  if (text === undefined || text === null || text === "") return ok({});
  let v = text;
  if (typeof text === "string") {
    try { v = JSON.parse(text); } catch { return fail("bad_reply", `${name} didn't answer in JSON`); }
  }
  if (Array.isArray(v)) return ok(v);
  if (!v || typeof v !== "object") return ok({ value: v });
  if (v.ok === false) return { ok: false, error: normError(v.error) };
  if (v.ok === true) return ok(v.data && typeof v.data === "object" ? v.data : {});
  if (v.error && typeof v.error === "object" && Object.keys(v).length <= 2) return { ok: false, error: normError(v.error) };
  return ok(v);
}
