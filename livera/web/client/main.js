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
import { el, avatar, castGroups, loadFaceManifest, loadSpriteManifest, firstName, money, titleCase, withoutCliHint, wordmark } from "./dom.js";
import { SKETCH_NOTICE } from "./layout.js";
import { Agenda } from "./today.js";
import { FirstMorning, howItWorks } from "./onboarding.js";
import { effectsText } from "./ui.js";
import { RoomView } from "./interior.js";

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
    this.agenda = new Agenda(this);           // Next and Today (today.js)
    this.firstMorning = new FirstMorning(this);
    this.shiftStart = null;    // the game minute your shift started, when this page saw it start
    this.riding = null;        // the stop you're riding to
    this.welcomedAs = null;    // "You're Dominique": said once per character per page
    this.stubAt = 0; this.bannerAt = 0; this.dayIndex = null; this.wxHour = null;
  }

  async start() {
    this.ui.init();
    this.renderer.onTap = t => this.onTap(t);
    this.renderer.getInsets = () => this.ui.insets();
    this.renderer.getMarks = () => ({ home: this.agenda.homeId(), work: this.agenda.workplaces().map(p => p.id), next: this.ui.nextItem && this.ui.nextItem.target });
    this.transport.on("welcome", d => this.onWelcome(d));
    this.transport.on("event", m => this.onEvent(m));
    this.transport.on("status", s => this.onStatus(s));
    await Promise.all([loadFaceManifest(), loadSpriteManifest()]);
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
      social: tab => this.transport.request("social_feed", { tab: tab || "town" }),  // read-only, like look (D-074)
      drop: () => { if (this.transport.ws) this.transport.ws.close(); },   // simulate a dropped connection
      welcomes: () => this.welcomes, bubbles: () => this.renderer.bubbleRects.map(b => ({ ...b })),
      next: () => (this.ui.nextItem ? { kind: this.ui.nextItem.kind, title: this.ui.nextItem.title, target: this.ui.nextItem.target || null, source: this.ui.nextItem.source } : null),
      floaters: () => this.renderer.floaters.map(f => ({ who: f.who, text: f.text })),
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
    const switched = this.welcomedAs !== this.character;
    if (switched) { this.agenda.reset(); this.firstMorning.reset(); this.shiftStart = null; this.ui.needAlert.clear(); }
    this.world.applyLook(look);
    this.agenda.learnHere(this.world.here);
    this.lastLook = performance.now();
    await this.refreshMap();
    if (!this.world.transit) {
      const t = await this.transport.request("phone", { app: "transit" });
      if (t.ok && Array.isArray(t.data.lines)) this.world.setTransit(t.data.lines);
    }
    this.refreshBank(); this.refreshWeather(); this.refreshCity(); this.refreshCareer(); this.refreshSchool();
    this.agenda.refresh("property"); this.agenda.refresh("calendar");
    if (this.world.self.inside) this.ui.sheetScene({ focus: false });
    // Once per character on this page: a reconnect or a resume doesn't say it again.
    if (switched) { this.welcomedAs = this.character; this.ui.toast(`You're ${this.world.selfName}.`, false, { log: false }); }
  }

  async logout() {
    await this.transport.request("logout");
    this.transport.clearToken();
    this.leaveGame();
    this.username = null; this.wasPlaying = false;
    this.screenLogin("Logged out.");
  }
  leaveGame() {
    this.phase = "login"; this.pending = null; this.riding = null;
    this.ui.showGame(false); this.phoneUI.close();
    this.world.people.clear(); this.world.self = null; this.world.here = null; this.world.money = null;
  }

  // ------------------------------------------------------------------ screens: connecting, login, pick, create
  screenConnecting(text) {
    this.ui.showScreen(el("div", { class: "screen-inner" }, wordmark(), el("h1", null, "Livéra"), el("p", { class: "hint", role: "status" }, text)));
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
      wordmark(), el("h1", null, "Log in"),
      el("p", { class: "hint" }, "A persistent multiplayer life sim, played in your browser. " + SKETCH_NOTICE + "."),
      howItWorks(),
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
    const cards = castGroups(list, c => {
      const taken = c.available === false;
      return el("button", { type: "button", class: "castcard", disabled: taken, dataset: { character: c.id }, onclick: async e => {
        e.currentTarget.disabled = true;
        const problem = await this.play(c.id);
        if (problem) { err.textContent = problem; e.currentTarget.disabled = false; }
      } }, avatar(c.id, c.name, "big"), el("span", { class: "who" },
        el("span", { class: "name" }, c.name),
        el("span", { class: "hint" }, [c.age, c.pronouns, c.career].filter(Boolean).join(" · ")),
        c.tagline ? el("span", { class: "tag" }, c.tagline) : null,
        c.home || c.workplace ? el("span", { class: "hint" }, [c.home ? `Home: ${c.home}` : "", c.workplace ? `Work: ${c.workplace}` : ""].filter(Boolean).join(" · ")) : null,
        el("span", { class: "row" },
          taken ? el("span", { class: "badge closed" }, "another player's") : null,
          c.created ? el("span", { class: "badge open" }, "yours") : null,
          c.scripted_now ? el("span", { class: "badge script" }, "played by a script right now") : null)));
    });
    this.ui.showScreen(el("div", { class: "screen-inner wide" },
      wordmark(), el("h1", null, "Who are you?"),
      el("p", { class: "hint" }, "One account plays one character, for good. Pick someone from the town or make your own. If a script is playing someone right now, you take over: people always win."),
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
    this.ui.showScreen(el("div", { class: "screen-inner" }, wordmark(), el("h1", null, "Make yourself"),
      el("p", { class: "hint" }, "Every choice here comes from the game's data, and the server checks the whole sheet."), form));
  }

  screenKicked(reason) {
    this.ui.showScreen(el("div", { class: "screen-inner" }, wordmark(), el("h1", null, "Playing elsewhere"),
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
      case "message": {
        const reading = this.phoneUI.open && this.phoneUI.app === "messages";
        if (!(reading && this.phoneUI.thread === d.from))
          ui.toast(`Message from ${name(d.from)}: ${String(d.body ?? "")}`, false, { action: { label: "Reply", run: () => this.openPhone("messages", { to: d.from }) } });
        this.phoneUI.unread++; this.setPhoneBadge();
        // Refresh the threads in place: what the player is typing stays, and so does the keyboard.
        if (reading) this.phoneUI.refreshMessages();
        return;
      }
      // They read what you sent (D-074): the thread says Seen.
      case "message_seen": if (this.phoneUI.open && this.phoneUI.app === "messages") this.phoneUI.refreshMessages(); return;
      // Social media (D-074): a like, a comment, a follow, a post you're in. The server keeps these to a few an hour;
      // the rest wait in the app's Activity tab.
      case "social": {
        if (this.phoneUI.open && this.phoneUI.app === "social") { this.phoneUI.socialChanged(); return; }
        this.phoneUI.socialNew++; this.setPhoneBadge();
        ui.toast(String(d.text ?? ""), false, { action: { label: "View", run: () => this.openPhone("social", { tab: "activity" }) } });
        return;
      }
      case "post": this.phoneUI.socialChanged(); return;   // someone you follow posted: the open feed shows it
      case "notification": {
        const text = withoutCliHint(d.text), now = performance.now();
        // One thing, one card: the pay stub already says the paycheck, the banner the promotion.
        if (now - this.stubAt < 8000 && /^Paycheck deposited/.test(text)) { ui.history.push({ who: "", text, kind: "note", cat: "activity", at: Date.now() }); return; }
        if (now - this.bannerAt < 8000 && /promoted to/i.test(text)) { ui.history.push({ who: "", text, kind: "note", cat: "activity", at: Date.now() }); return; }
        if (/promoted to/i.test(text) && d.kind === "career") { ui.banner("Promoted", text.replace(/^.*promoted to\s*/i, "").replace(/!$/, ""), null); return; }
        // An incident and the notes that follow it within 2 s are one story.
        if (now - (this.storyAt || 0) < 2000) { this.storyAt = now; ui.story(text); return; }
        if (["health", "details", "accident"].includes(d.kind) || /humiliat|wet yourself|in time/i.test(text)) { this.storyAt = now; ui.story(text); return; }
        ui.line("", text, "note");
        return;
      }
      // An ask and its answer each come with a notification too (the feed line), so no toast here.
      case "request": ui.sheetRequest(d); return;
      case "answer": return;
      case "interaction": {
        ui.line(name(d.from), String(d.label ?? d.interaction ?? ""), "note");
        const p = w.people.get(d.from);
        if (p) { p.known = true; this.renderer.addFloater({ who: d.from, text: String(d.label ?? d.interaction ?? "") }); }
        return;
      }
      case "gift": ui.toast(`${name(d.from)} gave you ${String(d.label ?? d.item ?? "something")}.`); return;
      case "incident":
        if (d.character === w.selfId) { this.storyAt = performance.now(); return; }   // your own: the story notes that follow say it
        ui.line("", `${name(d.character)}: ${titleCase(d.kind)}${d.crime ? ` (${d.crime})` : ""}`, "note"); return;
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
      if (now && this.ui.sheet && this.ui.sheet.kind === "scene" && this.world.here && this.ui.sheet.id !== this.world.here.id) this.ui.sheetScene({ focus: false });
      return;
    }
    if (now) { this.lastLook = 0; this.refreshLook().then(() => { if (this.world.here) this.ui.sheetScene({ focus: false }); }); }
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
    // A new game day: the date and the weather change with it (the weather's "today" turns at its
    // forecast hour, so it is asked again every game hour).
    const m0 = w.minute(now);
    if (m0 !== null) {
      const day = Math.floor(m0 / 1440), hr = Math.floor(m0 / 60);
      if (this.dayIndex !== null && day !== this.dayIndex) this.lastLook = 0;
      if (this.wxHour !== null && hr !== this.wxHour) this.refreshWeather();
      this.dayIndex = day; this.wxHour = hr;
    }
    this.agenda.tick(now);
    this.firstMorning.tick();
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
    if (r.ok && this.phase === "playing") { this.world.applyLook(r.data); this.agenda.learnHere(this.world.here); this.insideChanged(before); }
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
    if (r.ok) { this.world.career = r.data; this.ui.agendaChanged(); }
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
    if (campus && sheet && sheet.kind === "scene") this.ui.sheetScene({ focus: false });
  }

  // ------------------------------------------------------------------ taps on the map
  onTap(t) {
    if (this.phase !== "playing" || this.phoneUI.open) return;
    if (t.kind === "place") { this.ui.sheetPlace(t.id); return; }
    if (t.kind === "person") { this.ui.sheetPerson(t.id); return; }
    if (t.kind === "stop") { this.ui.sheetStop(t.id); return; }
    // Parks are open ground: tapping one walks you there.
    if (t.kind === "park") { const pl = this.world.placeById.get(t.id); if (pl && !this.world.self.inside) this.ui.toast(pl.name); }
    if (this.ui.sheet && ["place", "person", "stop", "needs", "log", "menu", "places", "today"].includes(this.ui.sheet.kind)) this.ui.closeSheet();
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
  // Every intent goes through here; what went through is reported to the first-morning checklist.
  async req(op, args) {
    const r = await this.transport.request(op, args);
    if (r && r.ok) { try { this.firstMorning.onReply(op, args || {}, r); } catch (e) { console.warn("checklist", e); } }
    return r;
  }
  // Go to a place: in through its door when it has one, else just walk there.
  goTo(placeId) {
    const w = this.world, pl = w.placeById.get(placeId), b = w.buildingById.get(placeId) || w.buildingOfPlace.get(placeId);
    if (pl && pl.enterable !== false) return this.goInside(placeId);
    const door = (pl && pl.door) || (b && b.door);
    if (door) { this.ui.closeSheet(); return this.walkTo(door); }
    return null;
  }
  // Stop whatever you're walking to: a real move to where you stand (the server moves you; you're there).
  async stop() {
    const w = this.world, me = w.selfPos();
    this.pending = null;
    if (!w.self || w.self.inside || !me || (w.self.mode === "bus" && w.self.target)) return;
    const r = await this.req("move", { x: round1(me[0]), y: round1(me[1]) });
    if (!r.ok) { this.ui.refusal(r); return; }
    w.selfMoving(r.data.target, w.rules.walk_speed_mps, "walk");
    this.ui.toast("Stopped.", false, { log: false });
  }
  insideNote() {
    const s = this.world.self;
    if (!s || !s.inside) return false;
    const here = this.world.here;
    this.ui.toast(`You're inside ${here ? here.name : "a building"}. Exit first.`, true, { action: { label: "Exit", run: () => this.exit() } });
    return true;
  }

  async walkTo(pt, keepPending = false) {
    if (!keepPending) this.pending = null;
    if (!pt) return { ok: false };
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
    if (dist(me, pl.door) <= w.rules.entry_radius_m - 0.3) {
      // At the door already: a refusal is said, never dropped (R1.6d).
      const r = await this.enterNow(placeId);
      if (!r.ok) this.ui.refusal(r, `Couldn't go into ${pl.name}`, { place: pl });
      return;
    }
    const r = await this.walkToLocation(placeId);
    if (!r.ok) return;
    const eta = Number(r.data.eta_seconds) || 0;
    this.pending = { kind: "enter", place: placeId, until: performance.now() + (eta + 20) * 1000, nextTry: 0, tries: 0 };
    this.ui.closeSheet();
    this.ui.announce(`Walking to ${pl.name}`);
  }
  async enterNow(placeId) {
    const before = this.world.self.inside;
    const r = await this.req("enter", { location: placeId });
    if (!r.ok) return r;
    this.pending = null;
    this.world.applyLook(r.data);
    this.agenda.learnHere(this.world.here);
    this.insideChanged(before);
    if (!this.ui.sheet || this.ui.sheet.kind !== "scene") this.ui.sheetScene({ focus: false });
    this.ui.announce(`Inside ${this.world.here ? this.world.here.name : "the building"}`);
    return r;
  }
  async exit() {
    const where = this.world.here && this.world.here.name;
    const r = await this.req("exit");
    if (!this.ui.refusal(r)) return;
    // Leaving work ends the shift: the same pay stub as End shift.
    if (r.data.shift) { this.ui.payStub(r.data.shift, where); this.shiftStart = null; this.refreshCareer(); this.agenda.refresh("work"); }
    if (r.data.study) this.ui.toast("Study session ended");
    this.world.self.inside = "";
    this.world.here = null;
    this.ui.closeSheet();
    this.lastLook = 0; await this.refreshLook();
    if (r.data.shift) this.refreshBank();
  }

  // What a reply did to your needs, against what you had before: "Hygiene 85 → 100".
  needChanges(before, after) {
    // A change of 2 or more: the clock's own drift between two looks isn't something you did.
    return Object.entries(after || {}).filter(([k, v]) => typeof v === "number" && typeof before[k] === "number" && Math.abs(v - before[k]) >= 1.5)
      .sort((a, b) => Math.abs(b[1] - before[b[0]]) - Math.abs(a[1] - before[a[0]]))
      .map(([k, v]) => `${titleCase(k)} ${Math.round(before[k])} → ${Math.round(v)}`).join(" · ");
  }
  floatGains(before, after) {
    const gains = {};
    for (const [k, v] of Object.entries(after || {})) if (typeof v === "number" && typeof before[k] === "number" && Math.abs(v - before[k]) >= 1.5) gains[k] = v - before[k];
    const t = effectsText(gains, 2);
    if (t) this.renderer.addFloater({ who: this.world.selfId, text: t, self: true });
  }
  async buy(offer, method) {
    const w = this.world, before = { ...((w.self && w.self.needs) || {}) }, place = w.here && w.placeById.get(w.here.id);
    const r = await this.req("buy", { offer: offer.id, method });
    if (!this.ui.refusal(r, offer.label, { place, method, what: offer.label })) return r;
    const paid = typeof r.data.price_cents === "number" ? r.data.price_cents : offer.price_cents;
    const toast = this.ui.toast(`Bought ${offer.label} · −${money(paid)} (${method === "phone" ? "LivPay" : method})`);
    this.refreshBank(); this.lastLook = 0;
    // The bought thing's effect on your needs, once the server's next look says it.
    await this.refreshLook();
    const changed = this.needChanges(before, w.self && w.self.needs);
    if (changed && toast.isConnected) { toast.append(` · ${changed}`); const h = this.ui.history.filter(x => x.kind === "result").pop(); if (h && h.text.startsWith(`Bought ${offer.label}`)) h.text += ` · ${changed}`; }
    if (changed) this.floatGains(before, w.self.needs);
    return r;
  }
  async activity(a) {
    const w = this.world, here = w.here, before = { ...((w.self && w.self.needs) || {}) };
    const r = await this.req("activity", { activity: a.id });
    if (!r.ok) {
      // "You just did that": dim the button with when it's ready again, when the content says.
      const m = w.minute(), key = here ? `${here.id}/${a.id}` : null;
      const wait = a.ready_in_minutes > 0 ? a.ready_in_minutes : a.cooldown_minutes > 0 ? a.cooldown_minutes : 0;
      if (r.error.code === "too_soon" && key && m !== null && wait && !this.ui.cooling.has(key)) this.ui.cooling.set(key, m + wait);
      const left = key && this.ui.cooling.has(key) && m !== null ? this.ui.cooling.get(key) - m : 0;
      this.ui.refusal(r, a.label, { cooldown: left, place: here && w.placeById.get(here.id) });
      if (r.error.code === "too_soon" && this.ui.sheet && this.ui.sheet.kind === "scene") this.ui.sheetScene({ focus: false });
      this.lastLook = 0;
      return r;
    }
    // "Take a shower · Hygiene 85 → 100": the reply's needs against the ones you had.
    const after = r.data && r.data.needs && typeof r.data.needs === "object" ? r.data.needs : null;
    const changed = after ? this.needChanges(before, after) : "";
    if (after && w.self) w.self.needs = { ...w.self.needs, ...after };
    this.ui.toast(changed ? `${a.label} · ${changed}` : `${a.label}: done.`);
    if (after) this.floatGains(before, after);
    if (here && a.cooldown_minutes > 0 && w.minute() !== null) this.ui.cooling.set(`${here.id}/${a.id}`, w.minute() + a.cooldown_minutes);
    this.lastLook = 0;
    // The tray reads the new look by itself; an open card is drawn again.
    if (w.self && w.self.inside) { await this.refreshLook(); if (this.ui.sheet && this.ui.sheet.kind === "scene") this.ui.sheetScene({ focus: false }); }
    return r;
  }
  async work(action) {
    const w = this.world, where = w.here && w.here.name;
    const r = await this.req("work", { action });
    const job = this.agenda.workplaces()[0];
    if (!this.ui.refusal(r, null, { goWork: job ? { name: job.name, run: () => this.goTo(job.id) } : null })) return r;
    if (action === "start") {
      this.shiftStart = w.minute();
      if (w.self) w.self.onShift = true;
      const c = w.career;
      this.ui.toast(`Shift started${c && c.hourly_cents ? ` · ${money(c.hourly_cents)}/hr` : ""}. End it to be paid for the hours worked.`);
    } else {
      if (w.self) w.self.onShift = false;
      this.shiftStart = null;
      this.ui.payStub(r.data, where);
    }
    this.refreshBank(); this.refreshCareer(); this.agenda.refresh("work");
    // The scene card follows the shift right away (one button, Start or End).
    await this.refreshLook();
    if (this.ui.sheet && this.ui.sheet.kind === "scene") this.ui.sheetScene({ focus: false });
    return r;
  }
  async study(action) {
    const r = await this.req("study", { action });
    if (!this.ui.refusal(r)) return;
    this.ui.toast(action === "start" ? "Studying." : "Study session ended."); this.lastLook = 0;
    await this.refreshSchool();
    if (this.ui.sheet && this.ui.sheet.kind === "scene") this.ui.sheetScene({ focus: false });
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
    this.ui.announce(`Walking to the ${stop.name} stop`);
  }
  async rideNow(to, pay, payWith) {
    const w = this.world;
    const r = await this.req("ride", { to, pay, pay_with: payWith });
    if (!r.ok) return r;
    this.pending = null;
    const dest = w.stopById(to), line = w.lineOfStop(to);
    this.riding = to;
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
    await this.walkOver(target, range, { kind: "interact", i });
  }
  // Walk over to someone, then act (Talk and asks alike): the doing-now pill shows it, Stop cancels it.
  async walkOver(target, range, act) {
    const w = this.world, who = firstName(w.nameOf(target));
    const pos = w.personPos(target);
    if (!pos || w.self.inside) { this.ui.toast(`${who} isn't close enough${w.self.inside ? ": you're inside, they're not" : ""}.`, true); return; }
    const r = await this.walkTo(pos);
    if (!r.ok) return;
    this.pending = { ...act, target, range, until: performance.now() + 30000, lastMove: performance.now(), nextTry: 0, tries: 0 };
    this.ui.toast(`Walking over to ${who}.`, false, { log: false, ms: 2500 });
  }
  async interactNow(i, target, quiet = false) {
    this.pending = null;
    const w = this.world, who = firstName(w.nameOf(target));
    const r = await this.req("interact", { interaction: i.id, target });
    if (!r.ok) { if (!quiet) this.ui.refusal(r, i.label, { person: who, walk: () => this.interact(i, target) }); return r; }
    // Their reaction (never their feelings: the server only says how it went for you), and a first meeting.
    const d = r.data || {}, reaction = typeof d.reaction === "string" && d.reaction !== "neutral" ? d.reaction : null;
    this.ui.toast(`${i.label} with ${who}${reaction ? ` · ${reaction}` : ""}${d.first_meeting ? ` · you met ${who}` : ""}.`);
    if (reaction || d.first_meeting) this.renderer.addFloater({ who: target, text: d.first_meeting ? (reaction ? `${reaction} · first meeting` : "first meeting") : reaction });
    const p = w.people.get(target);
    if (p && !p.known) { p.known = true; this.ui.facesKey = ""; }
    if (this.ui.sheet && this.ui.sheet.kind === "person" && this.ui.sheet.id === target && this.ui.sheet.update) this.ui.sheet.update(performance.now());
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
  // Asks walk you over like Talk does (they need you within 3 m), so "you need to be with them" can't happen.
  async ask(kind, target, extra = {}) {
    if (this.world.distanceTo(target) > 3) { await this.walkOver(target, 3, { kind: "ask", ask: kind, extra }); return; }
    await this.askNow(kind, target, extra);
  }
  async askNow(kind, target, extra = {}, quiet = false) {
    this.pending = null;
    const who = firstName(this.world.nameOf(target));
    const r = await this.req("request", { kind, target, ...extra });
    if (!r.ok) { if (!quiet) this.ui.refusal(r, null, { person: who, walk: () => this.ask(kind, target, extra) }); return r; }
    this.ui.toast(`Asked ${who}. Waiting for an answer.`);
    return r;
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
  // On a phone the phone covers the screen, so the card closes; wider screens keep it beside the phone.
  openPhone(app, opts) { if (this.ui.narrow()) this.ui.closeSheet(); this.phoneUI.show(app, opts); }
  // The phone button's count: new messages and new social activity (D-074), unless a number is given.
  setPhoneBadge(n) {
    if (typeof n !== "number") n = (this.phoneUI.unread || 0) + (this.phoneUI.socialNew || 0);
    const b = document.getElementById("phone-btn"), c = document.getElementById("phone-count");
    b.setAttribute("aria-label", n ? `Phone, ${n} new` : "Phone");
    b.classList.toggle("on", n > 0);
    if (c) { c.hidden = !n; c.textContent = n > 99 ? "99+" : String(n || ""); }
  }

  // Walk-then-act: act once the server agrees we're there; give up politely.
  async checkPending(now) {
    const p = this.pending, w = this.world;
    if (!p || p.busy || now < p.nextTry) return;
    if (now > p.until) {
      this.pending = null;
      const what = p.kind === "enter" ? (w.placeById.get(p.place) || {}).name : p.kind === "ride" ? "the stop" : firstName(w.nameOf(p.target));
      this.ui.toast(`Didn't get to ${what || "there"} in time.`, true, { action: { label: "Try again", run: () => (p.kind === "enter" ? this.goInside(p.place) : p.kind === "interact" ? this.interact(p.i, p.target) : p.kind === "ask" ? this.ask(p.ask, p.target, p.extra) : null) } });
      return;
    }
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
            else { this.pending = null; this.ui.refusal(r, `Couldn't go into ${pl.name}`, { place: pl }); }
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
      } else if (p.kind === "interact" || p.kind === "ask") {
        const who = firstName(w.nameOf(p.target));
        if (!w.people.has(p.target)) {
          this.pending = null;
          this.ui.toast(`${who} walked out of sight.`, true, { action: { label: "Try again", run: () => (p.kind === "ask" ? this.ask(p.ask, p.target, p.extra) : this.interact(p.i, p.target)) } });
          return;
        }
        // Prediction runs a little ahead of the server: act once comfortably inside the range.
        const d = w.distanceTo(p.target, now);
        if (d <= Math.max(0.5, p.range - 1) || (still && d <= p.range)) {
          const r = p.kind === "ask" ? await this.askNow(p.ask, p.target, p.extra, true) : await this.interactNow(p.i, p.target, true);
          if (!r.ok && r.error.code === "too_far" && ++p.tries < 5) { this.pending = p; p.nextTry = now + 700; }
          else if (!r.ok) this.ui.refusal(r, p.kind === "ask" ? null : p.i.label, { person: who });
        } else if (still && now - p.lastMove > 1500) {
          const pos = w.personPos(p.target, now);
          p.lastMove = now;
          if (pos) { const r = await this.walkTo(pos, true); if (!r.ok) this.pending = null; }
        }
      }
    } finally { if (this.pending === p) p.busy = false; }
  }

  // --- verbs (engineer B)
  // The ops the client had no screen for (web/client/verbs.js puts them where they happen; the
  // phone apps use them too). Each sends one op and returns the server's reply as it came, without
  // a toast: the phone shows results in place and verbs.js words them (`summary`). Money that moved
  // refreshes the bank; a new job or a work call refreshes the career.
  async workAnswer(task, option) { const r = await this.req("work_answer", { task, option }); if (r.ok) this.refreshCareer(); return r; }
  async apply(career) { const r = await this.req("apply", { career }); if (r.ok) this.refreshCareer(); return r; }
  async joinTeam(team) { const r = await this.req("join_team", { team }); if (r.ok) this.refreshBank(); return r; }
  leaveTeam(team) { return this.req("leave_team", { team }); }
  async adopt(pet, name = "", method = "card") {
    const args = { pet, method };
    if (name) args.name = name;
    const r = await this.req("adopt", args);
    if (r.ok) this.refreshBank();
    return r;
  }
  petCare(pet, action) { return this.req("pet", { pet, action }); }
  async vetVisit(pet, service, method = "card") { const r = await this.req("vet", { pet, service, method }); if (r.ok) this.refreshBank(); return r; }
  async buyHome(property, downPaymentCents = 0) {
    const args = { property };
    if (downPaymentCents > 0) args.down_payment_cents = downPaymentCents;
    const r = await this.req("buy_home", args);
    if (r.ok) this.refreshBank();
    return r;
  }
  wear(item) { return this.req("wear", { item }); }
  takeOff(slot) { return this.req("take_off", { slot }); }
  async use(item) { const r = await this.req("use", { item }); if (r.ok) this.lastLook = 0; return r; }
  async perform(song) { const r = await this.req("perform", { song }); if (r.ok) this.lastLook = 0; return r; }
  releaseSong(song) { return this.req("song_release", { song }); }
  async laundry() { const r = await this.req("laundry"); if (r.ok) { this.refreshBank(); this.lastLook = 0; } return r; }
  buyWithCoins(item) { return this.req("buy_with_coins", { item }); }
  switchPhone(item) { return this.req("switch_phone", { item }); }

  // --- interiors (D-066)
  // Inside a place whose room the server describes and this client has a picture of, the room is the scene: the
  // view, its taps (move_inside, sit, stand, the counter, the stage, the doors) and the `room` event live in
  // interior.js. It attaches itself once the transport, renderer and UI exist, and draws over the town.
  interiors = new RoomView(this);
}

// --- moments
// Life events, the street and fights (moments.js; D-068, D-069, D-070): their events are taken there first, the
// module comes in with the world (it reads the same look and people messages), and the You card gets its street
// lines from it. Everything else the Game does is unchanged.
import { installMoments } from "./moments.js";
{
  const onEvent = Game.prototype.onEvent, enterWorld = Game.prototype.enterWorld, leaveGame = Game.prototype.leaveGame;
  Game.prototype.onEvent = function (msg) {
    if (this.moments && this.moments.onEvent(msg)) return undefined;
    return onEvent.call(this, msg);
  };
  Game.prototype.enterWorld = async function (look) {
    if (!this.moments) { this.moments = installMoments(this); this.youExtras = () => this.moments.youNodes(); }
    const r = await enterWorld.call(this, look);
    this.moments.entered();
    return r;
  };
  Game.prototype.leaveGame = function () { if (this.moments) this.moments.reset(); return leaveGame.call(this); };
}

// The live page boots here. Pages that boot their own subclass of Game set data-boot on <body>:
// single-player (solo/index.html, "solo") and Play together (together/index.html, "together").
if (!document.body.dataset.boot) new Game().start();
