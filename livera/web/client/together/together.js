// "Play together": one town for a few friends, with no server. One person's tab hosts the town (host.js: the game
// core in WebAssembly, the same rules and refusals as the live server) and everyone, the host's own player
// included, plays it through the same game client (../main.js) over a transport that talks to the host
// (transport_room.js): friends through the artifact's room, encrypted per person (link.js).
//
// This page is the shell around the game: it finds the platform's room, database and user, watches `town/host` to
// know who hosts, shows who's here, lets an admin (the owner or an Editor) host, connects everyone else to the
// host, and puts people back in their character when the host comes back or another admin takes over.
//
// Honest labels (rule 6), on the lobby, the menu and the HUD: the town runs in the host's browser; it pauses while
// the host's tab is hidden and stops when it's closed; the host's browser holds everyone's state.

import { Game } from "../main.js";
import { RoomTransport } from "./transport_room.js";
import { TownHost, PATHS, MAX_PEOPLE } from "./host.js";
import { Pacer, FriendEnd, newKeyPair, publicKeyText, randomId, LINK_TOTALS } from "./link.js";
import { el, avatar, castGroups, lotus, wordmark } from "../dom.js";
import { SKETCH_NOTICE } from "../layout.js";

export const TOGETHER_NOTICE = "Play together: the town runs in the host's browser. It pauses while the host's tab is hidden or closed, and the host's browser holds everyone's state.";
export const PRIVACY_NOTICE = "Whoever hosts can see everything in the town: every person's money, messages and feelings. What travels between you and the host is encrypted for the two of you, but the host's browser holds it all. Play with people you trust.";
const HUD_FRIEND = "The town runs in the host's browser and pauses while their tab is hidden or closed.";
const HUD_HOST = "You're hosting: the town runs in this tab and pauses while it's hidden or closed.";
const PAUSED_BANNER = "Paused: the host's tab is in the background. The town waits for them; nothing moves.";
const IN_ARTIFACT = !!globalThis.LIVERA_IN_ARTIFACT;
const BOOT_GRACE_MS = 3000;    // the room's peer list fills in over a second or two after load
const HOST_GRACE_MS = 10000;   // a host missing from the room this long has left (connections blip now and then)
const LOBBY_AFTER_MS = 4000;   // a player whose host is gone this long goes back to the lobby (and back in later)

// This tab's id for the host lease. Kept for the tab's life (sessionStorage survives a reload), so a host who
// reloads takes the town straight back instead of waiting for their own old lease to run out.
function tabId() {
  try {
    let id = sessionStorage.getItem("livera-together-tab");
    if (!id) { id = randomId(6); sessionStorage.setItem("livera-together-tab", id); }
    return id;
  } catch { return randomId(6); }
}
const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
const ago = when => {
  const ms = Math.max(0, Date.now() - new Date(when).getTime());
  if (!isFinite(ms)) return "";
  if (ms < 60000) return "just now";
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  return new Date(when).toLocaleString();
};

class TogetherGame extends Game {
  constructor() {
    const transport = new RoomTransport();
    super({ transport });
    this.rt = transport;
    this.tabId = tabId();
    this.room = null; this.db = null; this.user = null;
    this.uid = null; this.myPeer = null; this.canHost = false; this.canPlay = null;
    this.keyPair = null; this.publicKey = null; this.pacer = null;
    this.hostDoc = null; this.hostDocSeen = false;
    this.host = null; this.friend = null; this.starting = false;
    this.volunteer = false;      // this page takes over hosting if the host goes: it has hosted or played here
    this.rejoin = null;          // the character to sit back down as when the town is back
    this.afterWelcome = null;    // "pick": go to the picker once the host welcomes us
    this.lobbyMessage = ""; this.lobbyTone = "note";
    this.hostError = null; this.confirmFresh = false;
    this.refused = null;         // why the host or the room turned this page away for good
    this.paused = false;
    this.peerGoneAt = new Map();
    this.bootedAt = 0; this.booted = false;
    this.names = new Map();      // uid -> display name, as this viewer sees them
    this.nextTakeOver = 0;
    this.lobbyTimer = null; this.awayTimer = null;
    this.ui.sheetMenu = () => this.sheetMenu();
    this.rt.onHalt = () => this.reconcile();
    this.rt.onResume = () => this.reconcile();
  }

  async start() {
    await super.start();
    this.setHudNote();
    window.__liveraTogether = Object.freeze({
      role: () => this.role(), uid: () => this.uid, peer: () => this.myPeer, hostDoc: () => clone(this.hostDoc),
      status: () => this.rt.status, paused: () => this.paused, banner: () => (document.getElementById("conn").hidden ? "" : document.getElementById("conn").textContent),
      request: (op, args) => this.transport.request(op, args),
      link: () => ({ friend: this.friend ? this.friend.stats() : null, host: this.host && this.host.end ? this.host.end.channelStats() : null,
        hostEnd: this.host && this.host.end ? { ...this.host.end.stats } : null, sent: this.pacer ? this.pacer.sent : 0, totals: { ...LINK_TOTALS } }),
      host: Object.freeze({
        running: () => !!(this.host && this.host.running), humans: () => (this.host && this.host.M ? JSON.parse(this.host.M.town_humans()).data : []),
        advance: s => (this.host && this.host.running ? (this.host.advance(s), true) : false),
        care: () => (this.host && this.host.running && this.host.M.town_care ? JSON.parse(this.host.M.town_care()).ok : false),  // tests (D-080)
        save: how => (this.host ? this.host.save(how || "debug") : Promise.resolve(false)),
        lastSave: () => (this.host ? clone(this.host.lastSave) : null), lastSaveError: () => (this.host ? this.host.lastSaveError : null),
        ticks: () => (this.host ? this.host.ticks : 0), from: () => (this.host ? this.host.from : null),
        claims: () => (this.host ? this.host.claimList() : []), stats: () => (this.host ? { ...this.host.stats } : null),
      }),
    });
    await this.boot();
  }

  role() { return this.host && this.host.running ? "host" : this.friend && !this.friend.closed ? "friend" : "none"; }
  setHudNote() { const n = document.getElementById("together-note"); if (n) n.textContent = this.role() === "host" ? HUD_HOST : HUD_FRIEND; }

  // ------------------------------------------------------------------ the platform
  async boot() {
    this.screenConnecting("Connecting to the room…");
    const use = name => (globalThis.claude && typeof globalThis.claude.use === "function" ? globalThis.claude.use(name).catch(() => null) : Promise.resolve(null));
    const [room, db, user] = await Promise.all([use("room"), use("db"), use("user")]);
    this.room = room; this.db = db; this.user = user;
    if (!room || !db || !user) { this.screenUnavailable({ room: !!room, db: !!db, user: !!user }); return; }
    this.uid = await user.id();
    if (!this.uid) { this.screenNoIdentity(); return; }
    [this.canHost, this.canPlay] = await Promise.all([user.canEdit(), user.can("data.write")]);
    this.keyPair = await newKeyPair();
    this.publicKey = await publicKeyText(this.keyPair);
    this.pacer = new Pacer((topic, data) => room.emit(topic, data));
    this.pacer.onReject = (e, topic) => this.onSendRefused(e, topic);
    room.onPeers(change => this.onPeers(change), e => this.onRoomError(e));
    db.doc(PATHS.host).onSnapshot(snap => this.onHostDoc(snap), e => this.onRoomError(e));
    room.presence({ lv: 1, st: "lobby" }).catch(() => {});
    this.bootedAt = performance.now();
    this.booted = true;
    setInterval(() => this.reconcile(), 1000);
    this.screenLobby();
  }

  onPeers(change) {
    const me = change.peers.find(p => p.sameTab);
    if (me) this.myPeer = me.peer;
    this.reconcile();
  }

  onHostDoc(snap) {
    this.hostDoc = snap.exists ? clone(snap.data()) : null;
    this.hostDocSeen = true;
    const d = this.hostDoc;
    // Someone else's lease: this tab isn't the host any more.
    if (this.host && this.host.running && d && d.epoch && d.epoch !== this.host.epoch) this.host.lose("lease_lost");
    if (this.role() !== "host") { this.paused = !!(d && d.state === "hosting" && d.paused); this.updateBanner(); }
    this.reconcile();
  }

  onSendRefused(e, topic) {
    if (e && e.code === "not_permitted" && topic === "up") {
      this.refused = "view_only";
      if (this.friend) { this.friend.close(false); }
      this.rt.detach("view_only");
      this.renderLobbySoon();
    } else if (e && e.code !== "upstream_error") console.warn("together: the room refused a message", e);
  }
  onRoomError(e) {
    this.refused = this.refused || "room_lost";
    console.warn("together: lost the room or the database", e);
    this.renderLobbySoon();
  }

  nameOf(uid) { return uid === this.uid ? "you" : this.names.get(uid) || "Someone"; }
  // Names as this viewer sees them, asked for on every render (the platform caches them and refreshes them in the
  // background); a name that arrives or changes redraws what shows it.
  refreshNames(ids) {
    const want = [...new Set(ids.filter(Boolean))];
    if (!this.user || !want.length) return;
    this.user.profiles(want).then(ps => {
      let fresh = false;
      for (const [id, p] of Object.entries(ps || {})) if (p && p.name && this.names.get(id) !== p.name) { this.names.set(id, p.name); fresh = true; }
      if (!fresh) return;
      this.renderLobbySoon();
      if (this.ui.sheet && this.ui.sheet.kind === "menu") this.sheetMenu();
    });
  }
  shownIds() {
    const ids = this.room ? this.room.peers().map(p => p.by) : [];
    if (this.hostDoc && this.hostDoc.uid) ids.push(this.hostDoc.uid);
    if (this.host) for (const c of this.host.claimList()) ids.push(c.uid);
    return ids;
  }

  // Is someone hosting right now? Their page must be in the room (or have left it only moments ago).
  hostLive() {
    const d = this.hostDoc;
    if (!d || d.state !== "hosting" || !d.peer || !d.epoch || !d.pub) return false;
    if (this.host && this.host.running) return d.epoch === this.host.epoch;
    // This very tab hosted before a reload (the lease holder survives in sessionStorage): that town is gone.
    if (d.peer === this.myPeer || d.holder === `${this.uid}|${this.tabId}`) return false;
    const t = performance.now();
    if (this.room.peers().some(p => p.peer === d.peer)) { this.peerGoneAt.delete(d.peer); return true; }
    if (t - this.bootedAt < BOOT_GRACE_MS) return true;
    if (!this.peerGoneAt.has(d.peer)) this.peerGoneAt.set(d.peer, t);
    return t - this.peerGoneAt.get(d.peer) < HOST_GRACE_MS;
  }

  // Once a second and on every change: connect to the host there is, or (an admin who has been in the town) take over.
  reconcile() {
    if (!this.booted || this.refused) return;
    if (this.host) {
      if (this.host.running) {
        if (!this.rt.pipe && !this.rt.halted) this.rt.attach(this.host.localPipe());
        return;
      }
      const reason = this.host.stopReason;
      this.host = null;
      this.setHudNote();
      this.room.presence({ lv: 1, st: "lobby" }).catch(() => {});
      if (reason === "lease_lost") { this.lobbyMessage = "Another tab took over hosting while this one was in the background."; this.lobbyTone = "warn"; }
    }
    const d = this.hostDoc;
    const live = this.hostLive();
    if (live) {
      // A Viewer's moves would be refused by the room: don't try (the lobby says why).
      if (!this.rt.halted && this.myPeer && this.canPlay !== false && (!this.friend || this.friend.closed || this.friend.host.epoch !== d.epoch)) this.connectFriend(d);
    } else {
      if (this.friend) {
        this.friend.close(); this.friend = null;
        if (this.rt.pipe) this.rt.detach(d && d.state === "stopped" && d.reason === "stopped" ? "host_stopped" : "host_left");
      }
      // Only a tab someone is looking at takes over: hidden, the town would start paused.
      if (this.canHost && this.volunteer && !this.starting && !this.rt.halted && !document.hidden && performance.now() >= this.nextTakeOver) {
        // Several admins' pages may try at once; the lease lets one in, and the jitter spares the database.
        this.nextTakeOver = performance.now() + 2000 + Math.random() * 1500;
        this.startHosting({ auto: true });
      }
    }
    this.renderLobbySoon();
  }

  connectFriend(d) {
    if (this.friend) this.friend.close();
    const fe = new FriendEnd({ room: this.room, pacer: this.pacer, keyPair: this.keyPair, publicKey: this.publicKey, myPeer: this.myPeer, host: d });
    this.friend = fe;
    fe.onState(s => {
      if (s.state !== "closed" || this.friend !== fe) return;
      if (s.reason === "no_identity") { this.refused = "no_identity"; this.renderLobbySoon(); }
    });
    this.setHudNote();
    this.rt.attach(fe);
  }

  async startHosting({ fresh = false, auto = false } = {}) {
    if (this.starting || (this.host && this.host.running)) return;
    this.starting = true; this.hostError = null;
    if (!auto) this.renderLobbySoon();
    for (let i = 0; i < 30 && !this.myPeer; i++) await new Promise(r => setTimeout(r, 100));
    const host = new TownHost({ db: this.db, room: this.room, uid: this.uid, myPeer: this.myPeer, keyPair: this.keyPair, publicKey: this.publicKey,
      pacer: this.pacer, tabId: this.tabId, onChange: () => this.onHostChange() });
    const r = await host.start({ fresh });
    this.starting = false;
    if (!r.ok) {
      if (!auto || r.error.code !== "host_busy") this.hostError = r.error;
      this.renderLobbySoon();
      return;
    }
    this.host = host; this.volunteer = true; this.confirmFresh = false;
    if (this.friend) { this.friend.close(); this.friend = null; }
    this.rt.halted = false;
    if (!auto && !this.rejoin) this.afterWelcome = "pick";
    this.rt.attach(host.localPipe());
    this.room.presence({ lv: 1, st: "hosting" }).catch(() => {});
    this.setHudNote();
    this.ui.toast(r.data.from === "save" ? `You're hosting. The town goes on from its save${host.lastSave ? ` of ${ago(host.lastSave.at)}` : ""}.` : "You're hosting a new town.");
  }
  onHostChange() {
    if (this.host && !this.host.running) this.reconcile();
    if (this.ui.sheet && this.ui.sheet.kind === "menu") this.sheetMenu();
    this.renderLobbySoon();
  }

  // ------------------------------------------------------------------ the game's transport, as the game sees it
  onStatus(s) {
    if (!this.booted) return;
    this.updateBanner();
    if (s.status === "open") { clearTimeout(this.awayTimer); this.awayTimer = null; return; }
    if (s.status !== "closed") return;
    if (this.phase === "pick" || this.phase === "create") { this.screenLobby(this.awayText(), "warn"); return; }
    if (this.phase === "playing" && !this.awayTimer) {
      // A blip, or a handover: stay on the map for a moment, then wait in the lobby (and come back in by yourself).
      this.awayTimer = setTimeout(() => {
        this.awayTimer = null;
        if (this.phase === "playing" && this.rt.status !== "open") {
          this.leaveGame();
          this.room.presence({ lv: 1, st: "lobby" }).catch(() => {});
          this.screenLobby(this.awayText(), "warn");
        }
      }, LOBBY_AFTER_MS);
    }
    this.renderLobbySoon();
  }
  awayText() {
    const why = this.rt.lastClose && this.rt.lastClose.reason;
    const back = this.rejoin ? " You'll be put back in as yourself when the town is back." : "";
    if (why === "host_stopped" || why === "stopped") return `The host stopped the town. It's saved and goes on when someone hosts it again.${back}`;
    if (why === "host_left" || why === "closed") return `The host left, so the town has stopped. It goes on from its last save when someone hosts it again.${back}`;
    if (why === "lease_lost") return `Another tab took over hosting.${back}`;
    return `The connection to the host ended.${back}`;
  }
  updateBanner() {
    if (this.phase !== "playing") { this.ui.setConnection(null); return; }
    if (this.rt.status !== "open") this.ui.setConnection(this.rt.lastClose && /host_|stopped/.test(this.rt.lastClose.reason) ? "The host left. Waiting for the town to come back…" : "Reconnecting to the host…");
    else this.ui.setConnection(this.paused && this.role() !== "host" ? PAUSED_BANNER : null);
  }

  async onWelcome(d) {
    this.protocol = d.protocol || null;
    if (d.rules) this.world.setRules(d.rules);
    this.paused = !!(d.town && d.town.paused) && this.role() !== "host";
    this.updateBanner();
    if (this.rejoin) {
      const id = this.rejoin;
      const problem = await this.play(id);
      if (problem) this.rejoin = null;
      return;
    }
    if (this.afterWelcome === "pick") { this.afterWelcome = null; await this.screenPick(); return; }
    this.renderLobbySoon();
  }
  screenLogin(message) { this.screenLobby(message, "warn"); }

  onEvent(msg) {
    if (msg.event === "together_status") {
      const d = msg.data || {}, was = this.paused;
      this.paused = !!d.paused && !d.stopping && this.role() !== "host";
      this.updateBanner();
      // Walkers were predicted on while the town stood still: ask where everyone really is.
      if (was && !this.paused) this.lastLook = 0;
      if (this.phase === "lobby") this.renderLobbySoon();
      return;
    }
    super.onEvent(msg);
  }

  async enterWorld(look) {
    await super.enterWorld(look);
    this.rejoin = this.character;
    this.volunteer = true;
    if (this.role() !== "host") this.room.presence({ lv: 1, st: "playing" }).catch(() => {});
    this.updateBanner();
  }

  // "Log out" in the live client: here, leave the town and go back to the lobby. The character stays yours.
  async logout() {
    this.rejoin = null;
    await this.transport.request("logout");
    this.leaveGame();
    if (this.role() !== "host") this.room.presence({ lv: 1, st: "lobby" }).catch(() => {});
    this.screenLobby("You left the town. Your character stays yours; join again any time.");
  }

  async stopHosting() {
    if (!this.host) return;
    this.rejoin = null; this.volunteer = false;
    const host = this.host;
    await host.stop({ reason: "stopped" });
    if (this.phase === "playing") this.leaveGame();
    this.screenLobby("You stopped hosting. The town is saved; it goes on when you or another admin hosts it again.");
  }

  // ------------------------------------------------------------------ screens
  screenUnavailable(have) {
    this.phase = "unavailable";
    const missing = ["room", "db", "user"].filter(k => !have[k]).map(k => ({ room: "the room", db: "the database", user: "who you are" })[k]);
    this.ui.showScreen(el("div", { class: "screen-inner" }, wordmark(), el("h1", null, "Play together"),
      el("p", null, `This view can't reach ${missing.join(", ")}, so nobody can host or join a town here.`),
      el("p", { class: "hint" }, IN_ARTIFACT ? "Play together needs the published artifact opened on claude.ai by someone signed in, with its room, database and user capabilities. Single-player works anywhere." : "Open together/index.html (it brings a local stand-in for the platform), or the published artifact."),
      el("p", { class: "hint" }, TOGETHER_NOTICE)));
  }
  screenNoIdentity() {
    this.phase = "unavailable";
    this.ui.showScreen(el("div", { class: "screen-inner" }, wordmark(), el("h1", null, "Play together"),
      el("p", null, "This page can't tell who you are (signed out, or the platform gives no id here), and in a shared town every person plays as themselves. Sign in to claude.ai and open the page again."),
      el("p", { class: "hint" }, TOGETHER_NOTICE)));
  }

  renderLobbySoon() {
    if (this.phase !== "lobby" || this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => { this.lobbyTimer = null; if (this.phase === "lobby") this.screenLobby(undefined, undefined, true); }, 120);
  }

  // `tone`: "warn" for what went wrong (the host left), "note" for what the person did.
  // `onlyIfChanged`: a redraw in the background (once a second, and on every change in the room) replaces the
  // screen only when what it says changed, so it never swaps a button out from under a finger.
  screenLobby(message, tone = "note", onlyIfChanged = false) {
    this.phase = "lobby";
    this.refreshNames(this.shownIds());
    if (message !== undefined) { this.lobbyMessage = message; this.lobbyTone = tone; }
    const d = this.hostDoc, hosting = !!(this.host && this.host.running), live = hosting || this.hostLive();
    const open = this.rt.status === "open";
    const hostName = d && d.uid ? this.nameOf(d.uid) : "Someone";
    const town = el("div", { class: "card", id: "together-town" }, el("div", { class: "eyebrow" }, "The town"));
    const say = (text, cls = "") => town.append(el("p", { class: cls || null }, text));
    if (hosting) {
      say("You're hosting. Keep this tab open and in front: the town pauses while it's hidden and stops when it's closed.");
      if (this.host.lastSave) say(`Saved ${ago(this.host.lastSave.at)} to this page's database (every 20 s and when you leave the tab).`, "hint");
    } else if (live && d) {
      say(`Hosted by ${hostName}.${this.paused ? " Paused right now: the host's tab is in the background." : ""}`);
      if (!open) say(`Connecting to ${hostName === "you" ? "your other tab" : hostName}'s town…`, "hint");
    } else if (this.starting) {
      say("Starting the town in this tab…");
    } else if (d && d.state === "starting" && this.hostLive() === false && this.room.peers().some(p => p.peer === d.peer)) {
      say(`${hostName} is starting the town…`);
    } else {
      say("Nobody is hosting right now.");
      if (d && d.saved_at) say(`The town was last saved ${ago(d.saved_at)}; it goes on from there.`, "hint");
      if (!this.canHost) say("The town starts when the owner (or an Editor) opens this page and hosts it.", "hint");
    }
    const actions = el("div", { class: "stack" });
    if (this.refused === "view_only" || this.canPlay === false) {
      actions.append(el("p", { class: "err" }, "Your access to this page is view-only, so your moves can't reach the host. Ask the owner for Contributor access."));
    } else if (this.refused === "no_identity") {
      actions.append(el("p", { class: "err" }, "The host couldn't tell who you are, so you can't join. Sign in to claude.ai and open the page again."));
    } else if (this.refused === "room_lost") {
      actions.append(el("p", { class: "err" }, "This view lost its connection to the room or the database. Reload the page to try again."));
    } else {
      if (live && open) actions.append(el("button", { type: "button", class: "btn primary block", id: "together-join", onclick: () => this.screenPick() }, this.rejoin ? "Back to the town" : "Join the town"));
      if (!live && this.canHost) {
        actions.append(el("button", { type: "button", class: "btn primary block", id: "together-host", disabled: this.starting, onclick: () => this.startHosting() },
          this.starting ? "Starting the town…" : "Host the town here"));
        actions.append(el("p", { class: "hint" }, "Hosting runs the whole town in this tab, for everyone. It goes on from the last save, or starts a new town if there is none."));
      }
      if (this.hostError) {
        actions.append(el("p", { class: "err", role: "alert" }, this.hostError.message));
        if (this.hostError.code === "save_unreadable" && this.canHost) actions.append(this.freshTownControl());
      }
    }
    town.append(actions);
    const screen = el("div", { class: "screen-inner" },
      wordmark(), el("h1", null, "Play together"),
      el("p", { class: "hint", id: "together-notice" }, TOGETHER_NOTICE),
      this.lobbyMessage ? el("p", { class: this.lobbyTone === "warn" ? "err" : null, role: "status", id: "together-message" }, this.lobbyMessage) : null,
      town,
      el("div", { class: "card", id: "together-people" }, el("div", { class: "eyebrow" }, "Who's here"), this.peopleList()),
      el("p", { class: "hint" }, PRIVACY_NOTICE),
      el("p", { class: "hint" }, `Up to ${MAX_PEOPLE} people, one character each. Founders nobody plays live their day on autopilot. ${SKETCH_NOTICE}.`),
      globalThis.LIVERA_FAKE_PLATFORM ? el("p", { class: "hint", id: "together-fake" }, `Local test platform: every person here is a tab in this browser (fake_platform.js). You are ${globalThis.LIVERA_FAKE_PLATFORM.name} (${globalThis.LIVERA_FAKE_PLATFORM.level}).`) : null);
    const key = screen.textContent + "|" + [...screen.querySelectorAll("button")].map(b => `${b.id}:${b.disabled}`).join(",");
    if (onlyIfChanged && key === this.lobbyKey && document.getElementById("together-notice")) return;
    this.lobbyKey = key;
    this.ui.showScreen(screen);
  }
  freshTownControl() {
    const box = el("div", { class: "stack" });
    const ask = el("button", { type: "button", class: "btn danger block", id: "together-fresh", onclick: () => {
      box.replaceChildren(el("p", { class: "hint" }, "Start a new town and replace the saved one for everyone? There is no undo."),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn danger grow", id: "together-fresh-yes", onclick: () => this.startHosting({ fresh: true }) }, "Yes, a new town"),
          el("button", { type: "button", class: "btn grow", onclick: () => box.replaceChildren(ask) }, "Keep it")));
    } }, "Start a new town instead");
    box.append(ask);
    return box;
  }

  // Everyone with this page open, as the platform says (names as this viewer sees them; never anyone's character).
  peopleList() {
    if (!this.room) return el("p", { class: "hint" }, "Nobody yet.");
    const hostPeer = this.hostDoc && this.hostDoc.state === "hosting" ? this.hostDoc.peer : null;
    const people = new Map();
    for (const p of this.room.peers()) {
      if (p.kind !== "viewer") continue;
      const key = p.by || p.peer;
      const e = people.get(key) || { by: p.by, tabs: 0, host: false, me: false, st: new Set() };
      e.tabs++; e.host = e.host || p.peer === hostPeer || (p.sameTab && this.role() === "host"); e.me = e.me || p.isMe;
      if (p.presence && typeof p.presence.st === "string") e.st.add(p.presence.st);
      people.set(key, e);
    }
    if (!people.size) return el("p", { class: "hint" }, "Nobody yet.");
    const label = e => (e.host ? "hosting" : e.st.has("playing") ? "in the town" : "in the lobby");
    return el("ul", { class: "list", id: "together-people-list" }, [...people.values()].map(e => el("li", null, el("span", { class: "row" },
      el("b", null, e.me ? `${this.names.get(e.by) || "You"} (you)` : e.by ? this.names.get(e.by) || "Someone" : "Someone the platform didn't name"),
      el("span", { class: `badge ${e.host ? "open" : "closed"}` }, label(e)),
      e.tabs > 1 ? el("span", { class: "hint" }, `${e.tabs} tabs`) : null))));
  }

  async screenPick(message) {
    this.phase = "pick";
    const r = await this.transport.request("characters");
    if (this.phase !== "pick") return;
    if (!r.ok) { this.screenLobby(r.error.message, "warn"); return; }
    const err = el("p", { class: "err", role: "alert" }, message || "");
    const list = Array.isArray(r.data.characters) ? r.data.characters : [];
    const yours = r.data.yours || null;
    const yoursName = (list.find(c => c.id === yours) || {}).name;
    const cards = castGroups(list, c => {
      const other = yours && c.id !== yours;
      const taken = c.available === false || other;
      return el("button", { type: "button", class: "castcard", disabled: taken, dataset: { character: c.id }, onclick: async e => {
        e.currentTarget.disabled = true;
        const problem = await this.play(c.id);
        if (problem) { err.textContent = problem; e.currentTarget.disabled = false; }
      } }, avatar(c.id, c.name, "big"), el("span", { class: "who" },
        el("span", { class: "name" }, c.name),
        el("span", { class: "hint" }, [c.age, c.pronouns, c.career].filter(Boolean).join(" · ")),
        c.tagline ? el("span", { class: "tag" }, c.tagline) : null,
        el("span", { class: "row" },
          c.yours ? el("span", { class: "badge open" }, "yours") : null,
          c.available === false && !c.yours ? el("span", { class: "badge closed" }, "another player's") : null,
          c.scripted_now ? el("span", { class: "badge script" }, "on autopilot right now") : null)));
    });
    const people = typeof r.data.people === "number" ? `${r.data.people} of ${r.data.max_people || MAX_PEOPLE} people are in the town now.` : "";
    this.ui.showScreen(el("div", { class: "screen-inner wide" },
      wordmark(), el("h1", null, "Who are you?"),
      el("p", { class: "hint" }, yours ? `You play ${yoursName || "your character"} in this town. ${people}`
        : `One person plays one character in this town, for good (the host can let you pick again). Everyone nobody plays lives their day on autopilot; pick one and you take over: people always win. ${people}`),
      err, el("div", { class: "cast" }, cards),
      r.data.can_create ? el("button", { type: "button", class: "btn primary block", id: "create-btn", onclick: () => this.screenCreate() }, "Make your own character") : null,
      el("button", { type: "button", class: "btn ghost block", id: "together-back", onclick: () => this.screenLobby() }, "Back")));
  }

  // ------------------------------------------------------------------ the menu
  sheetMenu() {
    const ui = this.ui, hosting = this.role() === "host", host = this.host;
    this.refreshNames(this.shownIds());
    const d = this.hostDoc;
    const hostLine = hosting ? "You're hosting: keep this tab open and in front." : d && d.uid ? `Hosted by ${this.nameOf(d.uid)}.` : "";
    const body = [
      el("p", { class: "hint" }, `Playing ${this.world.selfName || "nobody yet"}. ${hostLine}`),
    ];
    if (hosting) {
      const saved = host.lastSave ? `Last saved ${ago(host.lastSave.at)}` : host.lastSaveError ? `Not saved: ${host.lastSaveError}` : "Not saved yet";
      body.push(el("p", { class: "hint" }, `${saved} · saves every 20 s and when you leave the tab.`),
        el("button", { type: "button", class: "btn primary block", id: "together-save", onclick: async () => { const okd = await host.save("manual"); ui.toast(okd ? "Saved." : `Couldn't save: ${host.lastSaveError || "no longer the host"}`, !okd); } }, "Save now"));
    }
    body.push(
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.followMe(); ui.closeSheet(); } }, "Follow me"),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.fitTown(); ui.closeSheet(); } }, "See the whole town"),
      el("button", { type: "button", class: "btn block", onclick: () => ui.sheetNeeds() }, "Needs and feelings"),
      el("button", { type: "button", class: "btn block", id: "together-leave", onclick: () => { ui.closeSheet(true); this.logout(); } }, "Leave the town"));
    if (hosting) body.push(el("button", { type: "button", class: "btn danger block", id: "together-stop", onclick: () => { ui.closeSheet(true); this.stopHosting(); } }, "Stop hosting"),
      el("p", { class: "hint" }, "Stopping saves the town and ends it for everyone; another admin who has played here takes over if one is in the room."));
    body.push(el("div", { class: "eyebrow" }, "Who's here"), this.peopleList());
    if (hosting) {
      const claims = host.claimList();
      body.push(el("div", { class: "eyebrow" }, "People and their characters"),
        el("p", { class: "hint" }, "Only you see this, because the town runs in your browser. Letting someone pick again frees their character."),
        claims.length ? el("ul", { class: "list", id: "together-claims" }, claims.map(c => el("li", null, el("span", { class: "row" },
          el("span", { class: "grow" }, `${this.nameOf(c.uid)}: ${host.nameOf(c.character)}${c.playing ? " (in the town)" : ""}`),
          c.playing ? null : el("button", { type: "button", class: "btn small", onclick: () => { const r = host.releaseClaim(c.uid); ui.toast(r.ok ? `${this.nameOf(c.uid)} can pick again.` : r.error.message, !r.ok); this.sheetMenu(); } }, "Let them pick again")))))
          : el("p", { class: "hint" }, "Nobody has picked a character yet."));
    }
    body.push(el("div", { class: "eyebrow" }, "What this is"),
      el("p", { class: "hint" }, TOGETHER_NOTICE),
      el("p", { class: "hint" }, PRIVACY_NOTICE),
      el("p", { class: "hint" }, SKETCH_NOTICE + ". Every outcome comes from the game core running in the host's tab, with the same rules and refusals as the multiplayer server."),
      el("p", { class: "hint" }, "Characters marked “played by a script” are the town's people on autopilot (founders, residents and townspeople nobody is playing): a routine inside the game core walks them through their day and evening and says no to every ask."),
      el("p", { class: "hint" }, `Protocol ${this.protocol || "unknown"}, together build.`));
    ui.openSheet("menu", "menu", [el("div", { class: "sheet-mark" }, lotus()), ui.head("Livéra · together", "Menu")], body);
  }
}

new TogetherGame().start();
