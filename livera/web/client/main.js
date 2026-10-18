// The game controller: session flow (connect, log in or resume, pick or make a character,
// play), the world updates (people stream, look, events), and the player's intents. Every
// intent is one server op; the server's answer or refusal is shown as it comes back. Walking
// somewhere and then acting (go inside, take the bus, talk to someone across the street) is
// two ops: a move, and the act once the server says you've arrived.

import { Transport } from "./transport.js";
import { World, dist, arrived } from "./state.js";
import { Renderer2D } from "./render2d.js";
import { UI } from "./ui.js";
import { Phone } from "./phone.js";
import { buildCreator } from "./creator.js";
import { el, avatar, loadFaceManifest, firstName, money, titleCase, withoutCliHint } from "./dom.js";
import { SKETCH_NOTICE } from "./layout.js";

const round1 = v => Math.round(v * 10) / 10;

export class Game {
  // `transport` (optional) replaces the WebSocket: the single-player page (solo/solo.js) passes
  // one that runs the world in the browser and subclasses Game for its own screens.
  constructor({ transport } = {}) {
    this.world = new World();
    this.transport = transport || new Transport();
    this.renderer = new Renderer2D(document.getElementById("town"), this.world);
    this.ui = new UI({ world: this.world, game: this, renderer: this.renderer });
    this.phoneUI = new Phone({ world: this.world, game: this, ui: this.ui });
    this.username = null; this.character = null; this.protocol = null;
    this.phase = "boot";       // boot | login | pick | create | playing | kicked
    this.wasPlaying = false;
    this.pending = null;       // a walk-then-act intent
    this.lastLook = 0; this.lookBusy = false; this.lastBank = 0; this.lastWeather = 0; this.lastCity = 0;
    this.mapHour = null;       // the game hour the map's open/closed statuses are from
    this.mapRetryAt = 0;
    this.welcomes = 0;         // welcomes seen: the first is this page load, later ones are reconnects
    this.takeOverNext = false; // "Play here instead": the next resume may kick the other device
  }

  async start() {
    this.ui.init();
    this.renderer.onTap = t => this.onTap(t);
    this.renderer.getInsets = () => this.ui.insets();
    this.transport.on("welcome", d => this.onWelcome(d));
    this.transport.on("event", m => this.onEvent(m));
    this.transport.on("status", s => this.onStatus(s));
    await loadFaceManifest();
    this.screenConnecting("Connecting to Livéra…");
    this.transport.connect();
    const loop = now => { this.renderer.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setInterval(() => this.tick(), 250);
    // For the end-to-end tests: a read-only view of the client's state.
    // `look` is the same read-only op the client polls; nothing here can change the world.
    const canvasXY = (sx, sy) => { const r = this.renderer.canvas.getBoundingClientRect(); return [sx + r.left, sy + r.top]; };
    window.__livera = Object.freeze({
      phase: () => this.phase, world: this.world, protocol: () => this.protocol,
      project: (x, y, z = 0) => canvasXY(...this.renderer.project(x, y, z)),
      hitAt: (cx, cy) => { const r = this.renderer.canvas.getBoundingClientRect(); return this.renderer.hitTest(cx - r.left, cy - r.top); },
      tapPoint: (kind, id) => { const h = this.renderer.hit.find(x => x.kind === kind && x.id === id && x.circle); return h ? canvasXY(h.circle[0], h.circle[1]) : null; },
      selfPos: () => this.world.selfPos(), streaming: () => this.world.streaming, scale: () => this.renderer.scale,
      look: () => this.transport.request("look"),
      drop: () => { if (this.transport.ws) this.transport.ws.close(); },   // simulate a dropped connection
      welcomes: () => this.welcomes, bubbles: () => this.renderer.bubbleRects.map(b => ({ ...b })),
    });
  }

  // ------------------------------------------------------------------ connection and session
  onStatus(s) {
    if (s.status === "open") return;
    if (s.status === "waiting" || s.status === "closed") {
      if (this.phase === "playing") this.ui.setConnection("Connection lost: reconnecting…");
      else if (this.phase === "boot") this.screenConnecting("Can't reach the game server. Retrying…");
    }
  }

  async onWelcome(d) {
    this.protocol = d.protocol || null;
    if (d.rules) this.world.setRules(d.rules);
    // Opening the page, or "Play here instead", may move the session here. A reconnect after a
    // drop (a locked phone, a Wi-Fi handoff) must not: the player may have moved to another device.
    const takeOver = this.welcomes++ === 0 || this.takeOverNext;
    this.takeOverNext = false;
    const r = await this.transport.resume(takeOver);
    if (r.ok) {
      this.username = r.data.username;
      this.ui.setConnection(null);
      // Halfway through making a character: keep the form as typed (a character made just before
      // the drop comes back in r.data.character, and then we play it).
      if (!r.data.character && this.phase === "create") return;
      await this.afterLogin(r.data);
      return;
    }
    this.ui.setConnection(null);
    if (r.error.code === "in_use_elsewhere") {
      this.transport.halt();
      if (this.phase === "playing") this.leaveGame();
      this.phase = "kicked";
      this.screenKicked("This account is playing on another device right now.");
      return;
    }
    // Nobody was logged in and the login form is up: keep what's typed in it.
    if (r.error.code === "no_token" && this.phase === "login" && document.getElementById("login-user")) return;
    if (this.phase === "playing") this.leaveGame();
    if (this.wasPlaying) this.screenLogin("The connection dropped and this server can't resume the session. Log in again.");
    else this.screenLogin();
  }

  async afterLogin(data) {
    this.username = data.username || this.username;
    if (data.character) { await this.play(data.character); return; }
    await this.screenPick();
  }

  async login(username, password) {
    const r = await this.transport.request("login", { username, password });
    if (!r.ok) return r.error.code === "login_throttled" ? `${r.error.message}` : r.error.message;
    if (r.data.token) this.transport.saveToken(r.data.token);
    await this.afterLogin(r.data);
    return null;
  }
  async register(username, password) {
    const r = await this.transport.request("register", { username, password });
    if (!r.ok) return r.error.code === "registration_closed" ? "Registration is closed on this server: ask the owner for an account." : r.error.message;
    return this.login(username, password);
  }

  async play(id) {
    const r = await this.transport.request("play", id ? { character: id } : {});
    if (!r.ok) {
      if (r.error.code === "already_playing") { const l = await this.transport.request("look"); if (l.ok) { await this.enterWorld(l.data); return null; } }
      if (this.phase === "playing") this.leaveGame();
      if (this.phase !== "pick") await this.screenPick(r.error.message);
      return r.error.message;
    }
    await this.enterWorld(r.data);
    return null;
  }

  async enterWorld(look) {
    this.phase = "playing"; this.wasPlaying = true;
    this.character = look.you && look.you.id;
    this.ui.hideScreen();
    this.ui.showGame(true);
    this.world.people.clear();
    this.world.applyLook(look);
    this.lastLook = performance.now();
    await this.refreshMap();
    if (!this.world.transit) {
      const t = await this.transport.request("phone", { app: "transit" });
      if (t.ok && Array.isArray(t.data.lines)) this.world.setTransit(t.data.lines);
    }
    this.refreshBank(); this.refreshWeather(); this.refreshCity(); this.refreshCareer(); this.refreshSchool();
    if (this.world.self.inside) this.ui.sheetScene();
    this.ui.toast(`You're ${this.world.selfName}.`);
  }

  async logout() {
    await this.transport.request("logout");
    this.transport.clearToken();
    this.leaveGame();
    this.username = null; this.wasPlaying = false;
    this.screenLogin("Logged out.");
  }
  leaveGame() {
    this.phase = "login"; this.pending = null;
    this.ui.showGame(false); this.phoneUI.close();
    this.world.people.clear(); this.world.self = null; this.world.here = null; this.world.money = null;
  }

  // ------------------------------------------------------------------ screens: connecting, login, pick, create
  screenConnecting(text) {
    this.ui.showScreen(el("div", { class: "screen-inner" }, el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Livéra"), el("p", { class: "hint", role: "status" }, text)));
  }

  screenLogin(message) {
    this.phase = "login";
    const user = el("input", { type: "text", id: "login-user", autocomplete: "username", autocapitalize: "none", spellcheck: "false", maxlength: "24", required: true });
    const pass = el("input", { type: "password", id: "login-pass", autocomplete: "current-password", maxlength: "128", required: true });
    const err = el("p", { class: "err", role: "alert" }, message || "");
    const busy = async fn => {
      err.textContent = "";
      const u = user.value.trim().toLowerCase(), p = pass.value;
      if (!u || !p) { err.textContent = "Enter a username and a password."; return; }
      for (const b of form.querySelectorAll("button")) b.disabled = true;
      const problem = await fn(u, p);
      for (const b of form.querySelectorAll("button")) b.disabled = false;
      if (problem) err.textContent = problem;
    };
    const form = el("form", { class: "stack", onsubmit: e => { e.preventDefault(); busy((u, p) => this.login(u, p)); } },
      el("label", { class: "field" }, "Username", user),
      el("label", { class: "field" }, "Password", pass),
      err,
      el("button", { type: "submit", class: "btn primary block", id: "login-btn" }, "Log in"),
      el("button", { type: "button", class: "btn block", id: "register-btn", onclick: () => busy((u, p) => this.register(u, p)) }, "Create account"));
    this.ui.showScreen(el("div", { class: "screen-inner" },
      el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Log in"),
      el("p", { class: "hint" }, "A persistent multiplayer life sim, played in your browser. " + SKETCH_NOTICE + "."),
      form,
      el("p", { class: "hint" }, "Usernames: 3–24 lowercase letters, digits or underscores. Passwords: 8–128 characters. Your password is never stored on this device; a session token keeps you logged in.")));
    setTimeout(() => user.focus(), 50);
  }

  async screenPick(message) {
    this.phase = "pick";
    const r = await this.transport.request("characters");
    if (!r.ok) { this.screenLogin(r.error.message); return; }
    const err = el("p", { class: "err", role: "alert" }, message || "");
    const list = Array.isArray(r.data.characters) ? r.data.characters : [];
    const cards = list.map(c => {
      const taken = c.available === false;
      return el("button", { type: "button", class: "castcard", disabled: taken, dataset: { character: c.id }, onclick: async e => {
        e.currentTarget.disabled = true;
        const problem = await this.play(c.id);
        if (problem) { err.textContent = problem; e.currentTarget.disabled = false; }
      } }, avatar(c.id, c.name, "big"), el("span", { class: "who" },
        el("span", { class: "name" }, c.name),
        el("span", { class: "hint" }, [c.age, c.pronouns, c.career].filter(Boolean).join(" · ")),
        c.tagline ? el("span", { class: "tag" }, c.tagline) : null,
        el("span", { class: "row" },
          taken ? el("span", { class: "badge closed" }, "another player's") : null,
          c.created ? el("span", { class: "badge open" }, "yours") : null,
          c.scripted_now ? el("span", { class: "badge script" }, "played by a script right now") : null)));
    });
    this.ui.showScreen(el("div", { class: "screen-inner wide" },
      el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Who are you?"),
      el("p", { class: "hint" }, "One account plays one character, for good. Pick a founding resident or make your own. If a script is playing someone right now, you take over: people always win."),
      err, el("div", { class: "cast" }, cards),
      r.data.can_create ? el("button", { type: "button", class: "btn primary block", id: "create-btn", onclick: () => this.screenCreate() }, "Make your own character") : null,
      el("button", { type: "button", class: "btn ghost block", onclick: () => this.logout() }, "Log out")));
  }

  async screenCreate() {
    this.phase = "create";
    const r = await this.transport.request("creator_options");
    if (!r.ok) { await this.screenPick(r.error.message); return; }
    const form = buildCreator(r.data, {
      onCancel: () => this.screenPick(),
      onSubmit: async sheet => {
        const c = await this.transport.request("create_character", { character: sheet });
        if (!c.ok) return c.error.message;
        this.ui.toast(`Welcome, ${c.data.name}. Your keys are at ${c.data.home}.`);
        return await this.play(c.data.id);
      },
    });
    this.ui.showScreen(el("div", { class: "screen-inner" }, el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Make yourself"),
      el("p", { class: "hint" }, "Every choice here comes from the game's data, and the server checks the whole sheet."), form));
  }

  screenKicked(reason) {
    this.ui.showScreen(el("div", { class: "screen-inner" }, el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Playing elsewhere"),
      el("p", null, reason || "This account logged in somewhere else."),
      el("button", { type: "button", class: "btn primary block", onclick: () => {
        this.phase = "boot"; this.takeOverNext = true; this.screenConnecting("Reconnecting…"); this.transport.resumeReconnecting();
      } }, "Play here instead")));
  }

  // ------------------------------------------------------------------ the world: events and polling
  onEvent(msg) {
    const d = msg.data && typeof msg.data === "object" ? msg.data : {};
    const w = this.world, ui = this.ui, name = id => w.nameOf(id);
    switch (msg.event) {
      case "welcome": return;
      case "people": { const before = w.self && w.self.inside; w.applyPeople(d.changes); this.insideChanged(before); return; }
      case "arrived": w.selfArrived(d.position); return;
      case "presence": if (!w.streaming) this.lastLook = 0; return;
      case "speech": {
        const who = d.name || name(d.from), vol = ["say", "shout", "whisper"].includes(d.volume) ? d.volume : "say";
        const far = typeof d.distance_m === "number" && d.distance_m > w.rules.say_range_m ? ` (${Math.round(d.distance_m)} m away)` : "";
        ui.line(vol === "whisper" ? `${who} (whispering to you)` : who + far, String(d.text ?? ""), vol);
        w.addBubble({ who: d.from, text: String(d.text ?? ""), volume: vol, pos: Array.isArray(d.position) ? d.position : null });
        return;
      }
      case "whispering":
        ui.line("", `${d.from_name || name(d.from)} whispers to ${d.to_name || name(d.to)}`, "whispering");
        w.addBubble({ who: d.from, kind: "whispering", toName: firstName(d.to_name || name(d.to)) });
        return;
      case "message":
        ui.toast(`Message from ${name(d.from)}: ${String(d.body ?? "")}`);
        this.phoneUI.unread++; this.setPhoneBadge(this.phoneUI.unread);
        // Refresh the threads in place: what the player is typing stays, and so does the keyboard.
        if (this.phoneUI.open && this.phoneUI.app === "messages") this.phoneUI.refreshMessages();
        return;
      case "notification": ui.line("", withoutCliHint(d.text), "note"); return;
      // An ask and its answer each come with a notification too (the feed line), so no toast here.
      case "request": ui.sheetRequest(d); return;
      case "answer": return;
      case "interaction": ui.line(name(d.from), String(d.label ?? d.interaction ?? ""), "note"); return;
      case "gift": ui.toast(`${name(d.from)} gave you ${String(d.label ?? d.item ?? "something")}.`); return;
      case "incident": ui.line("", `${name(d.character)}: ${titleCase(d.kind)}${d.crime ? ` (${d.crime})` : ""}`, "note"); return;
      case "performance": ui.line(name(d.performer || d.from || ""), "is performing here", "note"); return;
      case "date": ui.line("", `A date with ${name(d.with)}${d.place ? ` at ${d.place}` : ""}`, "note"); return;
      case "match": ui.line("", `${d.home_name || "Home"} v ${d.away_name || "Away"}: ${d.status === "full_time" ? `${d.home_score}–${d.away_score}` : "kick-off"}`, "note"); return;
      case "kicked":
        this.phase = "kicked"; this.transport.halt(); this.leaveGame(); this.phase = "kicked";
        this.screenKicked(d.reason ? `Disconnected: ${d.reason}.` : null);
        return;
      case "released":
        ui.toast(String(d.reason || "You were released from this character."), true);
        this.leaveGame(); this.screenPick();
        return;
      default: return;
    }
  }

  insideChanged(before) {
    const s = this.world.self;
    if (!s) return;
    const now = s.inside || "";
    if ((before || "") === now) {
      if (now && this.ui.sheet && this.ui.sheet.kind === "scene" && this.world.here && this.ui.sheet.id !== this.world.here.id) this.ui.sheetScene();
      return;
    }
    if (now) { this.lastLook = 0; this.refreshLook().then(() => { if (this.world.here) this.ui.sheetScene(); }); }
    else if (this.ui.sheet && (this.ui.sheet.kind === "scene" || this.ui.sheet.kind === "scene-mini")) this.ui.closeSheet();
  }

  tick() {
    if (this.phase !== "playing" || !this.world.self) return;
    const now = performance.now(), w = this.world;
    this.ui.tick(now);
    // Without the people stream (older servers) we poll `look` to see people and our own walk.
    const moving = w.self.target && !arrived(w.self, now);
    const every = w.streaming ? 5000 : (moving || this.pending ? 1000 : 2500);
    if (now - this.lastLook > every) this.refreshLook();
    if (now - this.lastBank > 30000) this.refreshBank();
    if (now - this.lastWeather > 120000) this.refreshWeather();
    if (now - this.lastCity > 300000) this.refreshCity();
    // Opening hours are whole hours, so statuses can only change with the hour (or a project
    // finishing, also caught within the hour). The clock is predicted and can run up to ~1.5
    // game minutes ahead of the server, so ask a few minutes after our own hour turns.
    const minute = w.minute(now);
    if (minute !== null && this.mapHour !== null && Math.floor((minute - 3) / 60) !== this.mapHour && now >= this.mapRetryAt) this.refreshMap();
    this.checkPending(now);
  }

  // The map: places with their open / closed / under construction status as of now.
  async refreshMap() {
    const minute = this.world.minute(), hourBefore = this.mapHour;
    if (minute !== null) this.mapHour = Math.floor((minute - 3) / 60);
    const sheet = this.ui.sheet, statusOf = id => { const b = this.world.buildingById.get(id) || this.world.buildingOfPlace.get(id) || this.world.placeById.get(id); return b ? b.status : null; };
    const before = sheet && sheet.kind === "place" ? statusOf(sheet.id) : null;
    const m = await this.transport.request("map");
    if (!m.ok) { this.mapHour = hourBefore; this.mapRetryAt = performance.now() + 5000; return; }
    this.world.setMap(m.data);
    if (minute === null && this.world.minute() !== null) this.mapHour = Math.floor((this.world.minute() - 3) / 60);
    // A place card that's open shows the new status right away.
    const now = this.ui.sheet;
    if (now && now === sheet && now.kind === "place" && statusOf(now.id) !== before) this.ui.sheetPlace(now.id);
  }

  async refreshLook() {
    if (this.lookBusy || this.transport.status !== "open") return;
    this.lookBusy = true; this.lastLook = performance.now();
    const before = this.world.self && this.world.self.inside;
    const r = await this.transport.request("look");
    this.lookBusy = false;
    if (r.ok && this.phase === "playing") { this.world.applyLook(r.data); this.insideChanged(before); }
    else if (!r.ok && r.error.code === "not_playing" && this.phase === "playing" && this.character) {
      // The server forgot we were playing (a reconnect): sit back down as the same character.
      await this.play(this.character);
    }
  }
  async refreshBank() {
    this.lastBank = performance.now();
    const r = await this.transport.request("phone", { app: "bank" });
    if (r.ok) { this.world.money = { bank_cents: r.data.bank_cents, cash_cents: r.data.cash_cents }; this.world.moneyError = null; }
    else if (r.error.code === "phone_dead" || r.error.code === "no_phone") { this.world.money = null; this.world.moneyError = r.error.code === "phone_dead" ? "phone dead" : "no phone"; }
  }
  async refreshWeather() {
    this.lastWeather = performance.now();
    const r = await this.transport.request("phone", { app: "weather" });
    if (r.ok && r.data.today) this.world.weather = r.data.today;
  }
  async refreshCity() {
    this.lastCity = performance.now();
    const r = await this.transport.request("phone", { app: "city" });
    if (r.ok && Array.isArray(r.data.construction)) this.world.setProjects(r.data.construction);
  }
  async refreshCareer() {
    const r = await this.transport.request("phone", { app: "career" });
    if (r.ok) this.world.career = r.data;
  }
  // What you're enrolled in and the programs (with their campuses): the scene card offers study
  // only at your own program's campus, and enrolling where a program you can join is taught.
  async refreshSchool() {
    const r = await this.transport.request("phone", { app: "school" });
    if (!r.ok) return;
    this.world.school = r.data;
    // A scene card already open at a campus gets its study part.
    const here = this.world.here, sheet = this.ui.sheet;
    const campus = here && (r.data.programs || []).some(p => Array.isArray(p.campuses) && p.campuses.includes(here.name));
    if (campus && sheet && sheet.kind === "scene") this.ui.sheetScene();
  }

  // ------------------------------------------------------------------ taps on the map
  onTap(t) {
    if (this.phase !== "playing" || this.phoneUI.open) return;
    if (t.kind === "place") { this.ui.sheetPlace(t.id); return; }
    if (t.kind === "person") { this.ui.sheetPerson(t.id); return; }
    if (t.kind === "stop") { this.ui.sheetStop(t.id); return; }
    // Parks are open ground: tapping one walks you there.
    if (t.kind === "park") { const pl = this.world.placeById.get(t.id); if (pl && !this.world.self.inside) this.ui.toast(pl.name); }
    if (this.ui.sheet && ["place", "person", "stop", "needs", "log", "menu"].includes(this.ui.sheet.kind)) this.ui.closeSheet();
    this.walkTo(t.world);
  }
  showPlace(id) {
    const b = this.world.buildingById.get(id) || this.world.buildingOfPlace.get(id) || this.world.placeById.get(id);
    if (!b) return;
    this.renderer.centerOn(b.door[0], b.door[1]); this.ui.syncFollow();
    this.ui.sheetPlace(id);
  }
  showStop(id) {
    const s = this.world.stopById(id);
    if (!s) return;
    this.renderer.centerOn(s.at[0], s.at[1]); this.ui.syncFollow();
    this.ui.sheetStop(id);
  }

  // ------------------------------------------------------------------ intents
  req(op, args) { return this.transport.request(op, args); }

  insideNote() {
    const s = this.world.self;
    if (!s || !s.inside) return false;
    const here = this.world.here;
    this.ui.toast(`You're inside ${here ? here.name : "a building"}. Exit first.`, true);
    return true;
  }

  async walkTo(pt, keepPending = false) {
    if (!keepPending) this.pending = null;
    if (this.insideNote()) return { ok: false };
    const r = await this.req("move", { x: round1(pt[0]), y: round1(pt[1]) });
    if (!r.ok) { this.ui.refusal(r); return r; }
    this.world.selfMoving(r.data.target, this.world.rules.walk_speed_mps, "walk");
    this.renderer.follow = true;
    return r;
  }
  async walkToLocation(id) {
    const r = await this.req("move", { location: id });
    if (!r.ok) { this.ui.refusal(r); return r; }
    this.world.selfMoving(r.data.target, this.world.rules.walk_speed_mps, "walk");
    this.renderer.follow = true;
    return r;
  }

  async goInside(placeId) {
    const w = this.world, pl = w.placeById.get(placeId);
    if (!pl) return;
    if (w.self.inside === placeId) { this.ui.sheetScene(); return; }
    if (this.insideNote()) return;
    const me = w.selfPos();
    if (dist(me, pl.door) <= w.rules.entry_radius_m - 0.3) { await this.enterNow(placeId); return; }
    const r = await this.walkToLocation(placeId);
    if (!r.ok) return;
    const eta = Number(r.data.eta_seconds) || 0;
    this.pending = { kind: "enter", place: placeId, until: performance.now() + (eta + 20) * 1000, nextTry: 0, tries: 0 };
    this.ui.closeSheet();
    this.ui.toast(`Walking to ${pl.name}${eta ? ` (about ${Math.ceil(eta)} s)` : ""}.`);
  }
  async enterNow(placeId) {
    const before = this.world.self.inside;
    const r = await this.req("enter", { location: placeId });
    if (!r.ok) return r;
    this.pending = null;
    this.world.applyLook(r.data);
    this.insideChanged(before);
    if (!this.ui.sheet || this.ui.sheet.kind !== "scene") this.ui.sheetScene();
    return r;
  }
  async exit() {
    const r = await this.req("exit");
    if (!this.ui.refusal(r)) return;
    const notes = [];
    if (r.data.shift) notes.push(`Shift ended${typeof r.data.shift.pay_cents === "number" ? `: paid ${money(r.data.shift.pay_cents)}` : ""}`);
    if (r.data.study) notes.push("Study session ended");
    if (notes.length) this.ui.toast(notes.join(" · "));
    this.world.self.inside = "";
    this.world.here = null;
    this.ui.closeSheet();
    this.lastLook = 0; await this.refreshLook();
    if (r.data.shift) this.refreshBank();
  }

  async buy(offer, method) {
    const r = await this.req("buy", { offer: offer.id, method });
    if (!this.ui.refusal(r, `Couldn't buy ${offer.label}`)) return r;
    this.ui.toast(`Bought ${offer.label} (${method === "phone" ? "LivPay" : method}).`);
    this.refreshBank(); this.lastLook = 0;
    return r;
  }
  async activity(a) {
    const r = await this.req("activity", { activity: a.id });
    if (!this.ui.refusal(r, a.label)) return;
    this.ui.toast(`${a.label}: done.`); this.lastLook = 0;
  }
  async work(action) {
    const r = await this.req("work", { action });
    if (!this.ui.refusal(r)) return;
    if (action === "start") this.ui.toast("Shift started. Ending it pays you for the hours worked.");
    else this.ui.toast(`Shift ended${typeof r.data.pay_cents === "number" ? `: paid ${money(r.data.pay_cents)}` : ""}${r.data.note ? ` · ${r.data.note}` : ""}`);
    this.refreshBank(); this.lastLook = 0; this.refreshCareer();
  }
  async study(action) {
    const r = await this.req("study", { action });
    if (!this.ui.refusal(r)) return;
    this.ui.toast(action === "start" ? "Studying." : "Study session ended."); this.lastLook = 0;
    this.refreshSchool();
    if (action === "end") this.refreshBank();
  }
  async enroll(program) {
    const r = await this.req("enroll", { program: program.id });
    if (!this.ui.refusal(r, `Couldn't enroll in ${program.name}`)) return;
    this.ui.toast(`Enrolled in ${r.data.program || program.name}.`);
    this.refreshSchool();
  }

  async rideFrom(stop, to, pay, payWith) {
    const w = this.world;
    if (this.insideNote()) return;
    if (dist(w.selfPos(), stop.at) <= w.rules.boarding_radius_m - 0.5 && arrived(w.self, performance.now())) { await this.rideNow(to, pay, payWith); return; }
    const r = await this.walkTo(stop.at);
    if (!r.ok) return;
    this.pending = { kind: "ride", stop: stop.id, to, pay, payWith, until: performance.now() + ((Number(r.data.eta_seconds) || 0) + 20) * 1000, nextTry: 0, tries: 0 };
    this.ui.closeSheet();
    this.ui.toast(`Walking to the ${stop.name} stop.`);
  }
  async rideNow(to, pay, payWith) {
    const w = this.world;
    const r = await this.req("ride", { to, pay, pay_with: payWith });
    if (!r.ok) return r;
    this.pending = null;
    const dest = w.stopById(to), line = w.lineOfStop(to);
    if (dest) w.selfMoving(dest.at, line && line.speed_mps ? line.speed_mps : undefined, "bus");
    const d = r.data;
    this.ui.toast(d.caught ? `A fare inspector caught you: fined ${money(d.fine_cents || 0)}.` : `Riding to ${d.to || (dest && dest.name) || "your stop"}${d.evaded ? " without paying" : d.fare_cents ? ` · paid ${money(d.fare_cents)}` : ""}.`, !!d.caught);
    this.ui.closeSheet(); this.refreshBank(); this.lastLook = 0;
    return r;
  }

  async say(text, volume, to) {
    const args = { text, volume };
    if (volume === "whisper") args.to = to;
    const r = await this.req("say", args);
    if (r.ok) this.world.addBubble({ who: this.world.selfId, text, volume });
    return r;
  }

  async interact(i, target) {
    const w = this.world, range = typeof i.range_m === "number" ? i.range_m : 3;
    if (w.distanceTo(target) <= range) { await this.interactNow(i, target); return; }
    const pos = w.personPos(target);
    if (!pos || w.self.inside) { this.ui.toast(`${firstName(w.nameOf(target))} isn't close enough.`, true); return; }
    const r = await this.walkTo(pos);
    if (!r.ok) return;
    this.pending = { kind: "interact", i, target, range, until: performance.now() + 30000, lastMove: performance.now(), nextTry: 0, tries: 0 };
    this.ui.toast(`Walking over to ${firstName(w.nameOf(target))}.`);
  }
  async interactNow(i, target, quiet = false) {
    this.pending = null;
    const r = await this.req("interact", { interaction: i.id, target });
    if (!r.ok) { if (!quiet) this.ui.refusal(r, i.label); return r; }
    this.ui.toast(`${i.label} with ${firstName(this.world.nameOf(target))}.`);
    return r;
  }
  async tip(target, cents) {
    if (!(cents > 0)) { this.ui.toast("Enter an amount.", true); return; }
    const r = await this.req("tip", { to: target, cents });
    if (!this.ui.refusal(r, "Tip")) return;
    this.ui.toast(`Tipped ${firstName(this.world.nameOf(target))} ${money(cents)}.`); this.refreshBank();
  }
  async livpay(target, cents, note) {
    if (!(cents > 0)) { this.ui.toast("Enter an amount.", true); return; }
    const args = { to: target, cents };
    if (note) args.note = note;
    const r = await this.req("livpay_send", args);
    if (!this.ui.refusal(r, "LivPay")) return;
    this.ui.toast(`Sent ${money(cents)} to ${firstName(this.world.nameOf(target))} with LivPay.`); this.refreshBank();
  }
  async give(target, item) {
    const r = await this.req("give", { to: target, item });
    if (!this.ui.refusal(r, "Give")) return;
    this.ui.toast(`Gave it to ${firstName(this.world.nameOf(target))}.`);
  }
  async inventory() {
    const r = await this.req("phone", { app: "items" });
    if (!r.ok) return null;
    return (r.data.items || []).filter(i => i && i.id).map(i => ({ id: i.id, label: `${i.label}${i.count > 1 ? ` ×${i.count}` : ""}` }));
  }
  async ask(kind, target, extra = {}) {
    const r = await this.req("request", { kind, target, ...extra });
    if (!this.ui.refusal(r)) return;
    this.ui.toast(`Asked ${firstName(this.world.nameOf(target))}. Waiting for an answer.`);
  }
  // Returns the server's reply: callers close the ask on success, and on `unknown_request` (it passed).
  async respond(id, accept) {
    const r = await this.req("respond", { request: id, accept });
    if (!this.ui.refusal(r)) return r;
    this.ui.toast(accept ? "You said yes." : "You said no.");
    return r;
  }
  phone(app) { return this.req("phone", { app }); }
  message(to, text) { return this.req("message", { to, text }); }
  openPhone(app) { this.ui.closeSheet(); this.phoneUI.show(app); }
  setPhoneBadge(n) {
    const b = document.getElementById("phone-btn");
    b.setAttribute("aria-label", n ? `Phone, ${n} new message${n > 1 ? "s" : ""}` : "Phone");
    b.classList.toggle("on", n > 0);
  }

  // Walk-then-act: act once the server agrees we're there; give up politely.
  async checkPending(now) {
    const p = this.pending, w = this.world;
    if (!p || p.busy || now < p.nextTry) return;
    if (now > p.until) { this.pending = null; this.ui.toast("Didn't get there. Try again.", true); return; }
    const me = w.selfPos(now), still = arrived(w.self, now);
    p.busy = true;
    try {
      if (p.kind === "enter") {
        const pl = w.placeById.get(p.place);
        if (w.self.inside === p.place) { this.pending = null; return; }
        if (pl && still && dist(me, pl.door) <= w.rules.entry_radius_m) {
          const r = await this.enterNow(p.place);
          if (!r.ok) {
            if (r.error.code === "too_far" && ++p.tries < 6) { p.nextTry = now + 700; this.lastLook = 0; }
            else { this.pending = null; this.ui.refusal(r, `Couldn't go into ${pl.name}`); }
          }
        }
      } else if (p.kind === "ride") {
        const stop = w.stopById(p.stop);
        if (stop && still && dist(me, stop.at) <= w.rules.boarding_radius_m) {
          const r = await this.rideNow(p.to, p.pay, p.payWith);
          if (!r.ok) {
            if (r.error.code === "not_at_stop" && ++p.tries < 6) { p.nextTry = now + 700; this.lastLook = 0; }
            else { this.pending = null; this.ui.refusal(r, "Couldn't take the bus"); }
          }
        }
      } else if (p.kind === "interact") {
        if (!w.people.has(p.target)) { this.pending = null; this.ui.toast("They're out of sight now.", true); return; }
        // Prediction runs a little ahead of the server: act once comfortably inside the range.
        const d = w.distanceTo(p.target, now);
        if (d <= Math.max(0.5, p.range - 1) || (still && d <= p.range)) {
          const r = await this.interactNow(p.i, p.target, true);
          if (!r.ok && r.error.code === "too_far" && ++p.tries < 5) { this.pending = p; p.nextTry = now + 700; }
          else if (!r.ok) this.ui.refusal(r, p.i.label);
        } else if (still && now - p.lastMove > 1500) {
          const pos = w.personPos(p.target, now);
          p.lastMove = now;
          if (pos) { const r = await this.walkTo(pos, true); if (!r.ok) this.pending = null; }
        }
      }
    } finally { if (this.pending === p) p.busy = false; }
  }
}

// The live page boots here; the single-player page (solo/index.html, data-boot="solo") imports
// Game and boots its own subclass.
if (document.body.dataset.boot !== "solo") new Game().start();
