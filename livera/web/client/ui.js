// The in-game interface around the map, map first (spec R1.4): a status strip (clock, money, the
// menu) with need chips only when a need runs low and a row of the faces in sight; a bottom bar
// (Places, Talk, a context button, Phone, You) with the Next card, the docked composer and the
// attribution line above it; a "doing now" pill with Stop; the feed of what you heard and what
// happened; and one card (sheet) at a time, with three heights on phones: a place, a person, a bus
// stop, the scene inside a building, an ask to answer, Places, Today, You, the log.
//
// Every button is an intent sent to the server through `game`; the server decides and the card
// shows its answer or its refusal, in plain words (messages.js). Server text only reaches the page
// through el() (text nodes), never as HTML.

import { el, replace, clear, money, avatar, firstName, titleCase, lotus, store } from "./dom.js";
import { typeName, SKETCH_NOTICE } from "./layout.js";
import { stamp } from "./render2d.js";
import { dist } from "./state.js";
import { icon } from "./icons.js";
import { explain, openingText, sentence } from "./messages.js";
import { sheetPlaces } from "./places.js";
import { needFixText } from "./today.js";
import { CoachMarks } from "./onboarding.js";
import { artStatus } from "./figures.js";

const ASKS = [
  { kind: "date", label: "Ask on a date" }, { kind: "kiss", label: "Ask for a kiss" }, { kind: "move_in", label: "Invite to move in" },
  { kind: "propose", label: "Propose" }, { kind: "marry", label: "Ask to marry now" }, { kind: "intimacy", label: "Ask for intimacy" },
];
// Talk, warmest first; Argue comes last, in a quieter style.
const WARMTH = ["chat", "joke", "compliment", "deep_talk", "flirt"];
const WX_LABEL = { sun: "sunny", cloud: "cloudy", rain: "rain", storm: "storm", snow: "snow" };
// Feelings that are bad for you when they run high (the rest are good when high).
const BAD_FEELINGS = new Set(["stress", "loneliness", "anger", "sadness", "embarrassment", "jealousy"]);
const SPEECH = new Set(["say", "shout", "whisper", "whispering"]);
// Where Places opens when a need runs low and no place you've been is known to help.
export const NEED_PLACES = { hunger: "food", social: "fun", recreation: "fun", health: "health", dental: "health", grooming: "shops" };
const HEIGHTS = ["peek", "half", "full"];
const DEFAULT_HEIGHT = { places: "full", scene: "half" };
const fmtMin = m => (m < 60 ? `${Math.max(1, Math.round(m))} min` : `${Math.floor(m / 60)} h${m % 60 >= 1 ? ` ${Math.round(m % 60)} min` : ""}`);
const etaText = s => (s < 1 ? "" : s < 60 ? `${Math.ceil(s)} s` : `${Math.round(s / 60)} min`);
// "+45 Hygiene · −5 Energy" from a reply's or the content's effects.
export const effectsText = (fx, max = 3) => Object.entries(fx || {}).filter(([, v]) => typeof v === "number" && Math.round(v) !== 0)
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, max).map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))} ${titleCase(k)}`).join(" · ");

export class UI {
  constructor({ world, game, renderer }) {
    this.world = world; this.game = game; this.renderer = renderer;
    this.volume = "say"; this.whisperTo = null; this.targetsKey = ""; this.needsKey = ""; this.facesKey = ""; this.ctxKey = ""; this.doingKey = "";
    this.sheet = null;   // {kind, id, update}
    this.history = [];   // {who, text, kind, cat: "speech" | "activity", at}
    this.logTab = "speech";
    this.talkOpen = false; this.talkUnread = 0;
    this.payMethod = ["card", "cash", "phone"].includes(store.get("livera.payWith")) ? store.get("livera.payWith") : "card";
    this.cooling = new Map();   // "place/activity" -> game minute it can be done again (after a "just did that")
    this.needAlert = new Map(); // need -> 20 | 10: the warning already given while it stays low
    this.lastNext = 0; this.nextKey = "";
    this.lastStory = null;
    this.opener = null;
    this.coach = new CoachMarks(this);
    this.$ = id => document.getElementById(id);
  }

  init() {
    const $ = this.$;
    $("sketch-note").textContent = SKETCH_NOTICE + ".";
    for (const [id, name] of [["z-in", "plus"], ["z-out", "minus"], ["z-fit", "fit"], ["z-me", "recenter"], ["log-btn", "log"]]) replace($(id), icon(name));
    replace($("menu-btn"), lotus());
    for (const [id, name] of [["places-btn", "places"], ["talk-btn", "talk"], ["phone-btn", "phone"]]) replace($(id).querySelector(".tab-icon"), icon(name));
    replace($("you-face"), icon("you"));
    replace(document.querySelector("#attrib-btn .attrib-i"), icon("info"));
    $("z-in").onclick = () => this.renderer.zoomBy(1.3);
    $("z-out").onclick = () => this.renderer.zoomBy(1 / 1.3);
    $("z-fit").onclick = () => { this.renderer.fitTown(); this.syncFollow(); };
    $("z-me").onclick = () => { this.renderer.followMe(); this.syncFollow(); };
    $("money").onclick = () => this.game.openPhone("bank");
    $("menu-btn").onclick = () => this.sheetMenu();
    $("clock").onclick = () => { const t = this.world.time, m = this.world.minute(); if (t && m !== null) this.toast(`${stamp(m)} · Day ${t.day}${t.month ? `, Month ${t.month}` : ""}${this.world.weather ? ` · ${this.weatherText()}` : ""}`, false, { log: false }); };
    $("log-btn").onclick = () => this.sheetLog();
    $("places-btn").onclick = () => (this.sheet && this.sheet.kind === "places" ? this.closeSheet() : this.sheetPlaces());
    $("talk-btn").onclick = () => this.toggleTalk();
    $("ctx-btn").onclick = () => this.runContext();
    $("phone-btn").onclick = () => this.game.openPhone();
    $("you-btn").onclick = () => (this.sheet && this.sheet.kind === "needs" ? this.closeSheet() : this.sheetYou());
    $("attrib-btn").onclick = () => this.toggleAttrib();
    for (const b of document.querySelectorAll("#chatbar [data-volume]")) b.onclick = () => this.setVolume(b.dataset.volume);
    const input = $("chat-input");
    input.addEventListener("focus", () => { this.renderer.ringHold = this.volume; });
    input.addEventListener("blur", () => { this.renderer.ringHold = null; });
    $("chatbar").addEventListener("submit", e => { e.preventDefault(); this.sendChat(); });
    document.addEventListener("keydown", e => this.onKey(e));
    // Keep the feed, the pill and the card above the bottom panels, whatever their height.
    const measure = () => this.measure();
    const ro = new ResizeObserver(measure);
    for (const id of ["hud", "dock", "sheet", "chatbar", "next", "bar", "attrib", "doing"]) ro.observe($(id));
    window.addEventListener("resize", () => { measure(); this.layoutTalk(); });
    this.setVolume("say", true);
    this.layoutTalk();
  }

  narrow() { return window.innerWidth < 700; }
  // CSS variables from what's on screen: --base-h (the panels under a card), --dock-h (all the
  // bottom panels), --sheet-h, --stack-h (what the feed and the pill stay above), --hud-h, --top-h.
  measure() {
    const $ = this.$, app = $("app"), H = window.innerHeight, narrow = this.narrow();
    const top = r => (r.height ? r.top : H);
    const dock = $("dock").hidden ? H : Math.min(top($("bar").getBoundingClientRect()), top($("attrib").getBoundingClientRect()), !$("chatbar").hidden ? top($("chatbar").getBoundingClientRect()) : H);
    const full = $("dock").hidden ? H : Math.min(dock, !$("next").hidden ? top($("next").getBoundingClientRect()) : H);
    const sheet = $("sheet").hidden ? 0 : $("sheet").offsetHeight;
    const base = H - dock, all = H - full;
    app.style.setProperty("--base-h", `${narrow ? base : all}px`);
    app.style.setProperty("--dock-h", `${all}px`);
    app.style.setProperty("--sheet-h", `${sheet}px`);
    const mini = sheet && $("sheet").classList.contains("mini");
    app.style.setProperty("--stack-h", `${narrow ? (sheet ? (mini ? all : base) + sheet + (mini ? 8 : 0) : all) : all}px`);
    app.style.setProperty("--doing-h", `${$("doing").hidden ? 0 : $("doing").offsetHeight + 8}px`);
    const hud = $("hud").hidden ? 0 : $("hud").getBoundingClientRect().bottom;
    app.style.setProperty("--hud-h", `${hud + 4}px`);
    // A card never climbs over the HUD (the strip, the need chips, the faces row).
    app.style.setProperty("--top-h", `${hud + 8}px`);
    // Wide screens: the attribution sits in the map's corner; the controls and the pill stay above it.
    const at = $("attrib-btn").getBoundingClientRect();
    app.style.setProperty("--attrib-h", `${narrow || !at.height ? 0 : Math.ceil(H - at.top)}px`);
    app.classList.toggle("sheet-full", !$("sheet").hidden && $("sheet").dataset.height === "full" && !$("sheet").classList.contains("mini"));
  }

  // The part of the map not under the HUD, the bottom panels or the card: the camera keeps you in it.
  insets() {
    const $ = this.$, H = window.innerHeight;
    const top = $("hud").hidden ? 0 : $("hud").getBoundingClientRect().bottom;
    if (this.narrow()) {
      const tops = [$("dock"), $("sheet"), $("doing")].filter(n => !n.hidden).map(n => n.getBoundingClientRect()).filter(r => r.height).map(r => r.top);
      return { top, bottom: tops.length ? Math.max(0, H - Math.min(...tops)) : 0, left: 0, blocks: this.blocks() };
    }
    const col = $("dock").hidden ? 0 : $("dock").getBoundingClientRect().right;
    return { top: 0, bottom: 0, left: col, blocks: this.blocks() };
  }
  // Floating panels map labels keep clear of: the map controls, the attribution, the pill, the banner.
  blocks() {
    const out = [];
    for (const id of ["mapctl", "attrib-btn", "doing", "banner", "hud"]) {
      const n = this.$(id);
      if (!n || n.hidden) continue;
      const r = n.getBoundingClientRect();
      if (r.width && r.height) out.push([r.left - 4, r.top - 4, r.width + 8, r.height + 8]);
    }
    return out;
  }
  showGame(on) {
    for (const id of ["hud", "mapctl", "dock"]) this.$(id).hidden = !on;
    if (!on) { this.closeSheet(true); this.$("doing").hidden = true; this.$("banner").hidden = true; this.$("attrib-pop").hidden = true; this.coach.hide(); this.setTalk(false); }
    this.layoutTalk();
    this.measure();
  }
  syncFollow() { const b = this.$("z-me"); b.classList.toggle("on", this.renderer.follow); b.setAttribute("aria-pressed", String(this.renderer.follow)); }
  setConnection(text) { const c = this.$("conn"); c.hidden = !text; c.textContent = text || ""; }
  announce(text) { const a = this.$("announcer"); a.textContent = ""; setTimeout(() => { a.textContent = String(text || ""); }, 30); }

  // ------------------------------------------------------------------ keyboard
  onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (e.key === "Escape") { if (this.closeTop()) e.preventDefault(); return; }
    if (typing || this.game.phase !== "playing" || !this.$("screen").hidden) return;
    const onButton = t && t.closest && t.closest("button, a, summary, [role=button]");
    if (e.key === "Enter" && !onButton) { e.preventDefault(); this.openTalk(true); return; }
    if (onButton) return;
    const k = e.key.toLowerCase();
    if (k === "p") { e.preventDefault(); this.game.openPhone(); }
    else if (k === "g") { e.preventDefault(); this.sheetPlaces(); }
    else if (k === "y") { e.preventDefault(); this.sheetYou(); }
  }
  // Esc closes the top layer: a coach mark, the "about" note, the phone, the card, then Talk.
  closeTop() {
    if (this.coach.node) { this.coach.hide(); return true; }
    if (!this.$("attrib-pop").hidden) { this.toggleAttrib(false); return true; }
    if (this.game.phoneUI && this.game.phoneUI.open) { this.game.phoneUI.close(); this.$("phone-btn").focus(); return true; }
    if (!this.$("banner").hidden) { this.$("banner").hidden = true; return true; }
    if (this.sheet && this.sheet.kind !== "scene-mini") { this.closeSheet(); return true; }
    if (this.talkOpen && this.narrow()) { this.setTalk(false); this.$("talk-btn").focus(); return true; }
    return false;
  }

  // ------------------------------------------------------------------ the strip, chips, faces, bar (a few times a second)
  tick(now) {
    const w = this.world, $ = this.$;
    const m = w.minute(now);
    if (m !== null) {
      $("clock-time").textContent = stamp(m);
      const t = w.time, wx = w.weather;
      $("clock-sub").textContent = [t && t.day ? `Day ${t.day}` : "", wx ? this.weatherText() : ""].filter(Boolean).join(" · ");
      $("app").classList.toggle("night", this.renderer.night > 0.55);
    }
    if (w.money) { $("money-bank").textContent = money(w.money.bank_cents); $("money-cash").textContent = `cash ${money(w.money.cash_cents)}`; }
    else if (w.moneyError) { $("money-bank").textContent = "$—"; $("money-cash").textContent = w.moneyError; }
    this.renderNeeds();
    this.needWarnings();
    this.renderFaces();
    this.renderBar();
    this.renderDoing(now);
    if (now - this.lastNext > 1000) { this.lastNext = now; this.renderNext(); }
    if (this.volume === "whisper") this.renderTargets();
    this.renderRangeNote();
    this.syncFollow();
    this.renderAttrib();
    if (this.sheet && this.sheet.update) this.sheet.update(now);
    if (w.self && !w.self.inside && !this.sheet && w.self.pos) this.coach.show("walk", null);
  }
  // Who your words reach. A whisper reaches only the one you pick (others nearby see that you
  // whisper, never what), indoors as well.
  renderRangeNote() {
    const w = this.world, inside = !!(w.self && w.self.inside);
    this.$("range-note").textContent = this.volume === "whisper" ? (inside ? "only they hear" : `only they hear, within ${w.rangeFor("whisper")} m`)
      : inside ? "everyone inside hears" : `reaches ${w.rangeFor(this.volume)} m`;
  }
  weatherText() {
    const wx = this.world.weather;
    if (!wx) return "";
    return `${WX_LABEL[wx.kind] || wx.label || wx.kind}${typeof wx.temp_c === "number" ? ` ${Math.round(wx.temp_c)}°C` : ""}`;
  }
  // Need chips only when a need runs low (below 35), lowest first, with the number; below 20 they
  // say "low" with an icon, never by colour alone.
  renderNeeds() {
    const s = this.world.self;
    if (!s || !s.needs) return;
    const low = Object.entries(s.needs).filter(([, v]) => typeof v === "number" && v < 35).sort((a, b) => a[1] - b[1]).slice(0, 3);
    const key = low.map(([k, v]) => `${k}${Math.round(v)}`).join();
    if (key === this.needsKey) return;
    this.needsKey = key;
    replace(this.$("needs"), low.map(([k, v]) => {
      const n = Math.round(v), level = v < 10 ? "critical low" : v < 20 ? "low" : "";
      return el("button", { type: "button", class: `need ${level}`, dataset: { need: k }, onclick: () => this.sheetYou(), "aria-label": `${titleCase(k)} ${n} of 100${v < 20 ? ", low" : ""}: open your needs` },
        el("span", { class: "pill" }, v < 20 ? icon("alert") : null, titleCase(k), el("span", { class: "num" }, String(n))));
    }));
    this.measure();
  }
  // A warning with the nearest fix before an accident: once below 20, again below 10.
  needWarnings() {
    const s = this.world.self;
    if (!s || !s.needs || this.game.phase !== "playing") return;
    for (const [k, v] of Object.entries(s.needs)) {
      if (typeof v !== "number") continue;
      const had = this.needAlert.get(k) || 100;
      if (v >= 25) { this.needAlert.delete(k); continue; }
      const level = v < 10 ? 10 : v < 20 ? 20 : 100;
      if (level >= had || level === 100) continue;
      this.needAlert.set(k, level);
      const fix = this.game.agenda.fixFor(k), n = Math.round(v);
      const action = fix && fix.here ? { label: fix.label.length > 22 ? "Do it" : fix.label, run: fix.run } : fix && fix.place ? { label: `Go to ${fix.place.name.length > 18 ? "it" : fix.place.name}`, run: () => this.game.goTo(fix.place.id) } : { label: "Places", run: () => this.sheetPlaces({ category: NEED_PLACES[k] }) };
      const text = level === 10 ? `${titleCase(k)} ${n}: you need to ${needFixText(k)} now.` : `${titleCase(k)} ${n}: ${needFixText(k)} soon.`;
      this.toast(text, level === 10 ? "alarm" : false, { action, ms: level === 10 ? 12000 : 8000 });
    }
  }
  // Faces of the people in sight outdoors: moving people are hard to tap on the map.
  renderFaces() {
    const w = this.world, box = this.$("faces");
    if (!w.self || w.self.inside) { if (!box.hidden) { box.hidden = true; this.facesKey = ""; this.measure(); } return; }
    const me = w.selfPos();
    const near = [...w.people.values()].filter(p => p.pos && !p.inside).map(p => ({ p, d: dist(me, p.pos) })).sort((a, b) => a.d - b.d).slice(0, 8);
    const key = near.map(x => x.p.id + (x.p.known ? "k" : "") + (x.p.scripted ? "s" : "")).join();
    if (key === this.facesKey) return;
    this.facesKey = key;
    box.hidden = !near.length;
    replace(box, near.map(({ p }) => el("button", { type: "button", class: `face${p.scripted ? " script" : ""}${p.known ? " known" : ""}`, dataset: { person: p.id },
      "aria-label": `${p.name}${p.scripted ? ", played by a script" : ""}`, title: p.name, onclick: () => this.sheetPerson(p.id) }, avatar(p.id, p.name))));
    this.measure();
  }
  // The context button: Stop while an intent runs, Exit inside, Go to the Next target, else Today.
  contextMode() {
    const g = this.game, w = this.world, s = w.self;
    if (!s) return { key: "today", label: "Today", icon: "today" };
    const riding = s.mode === "bus" && s.target;
    if (!riding && (g.pending || (s.target && !s.inside))) return { key: "stop", label: "Stop", icon: "stop", run: () => g.stop() };
    if (s.inside) return { key: "exit", label: "Exit", icon: "exit", run: () => g.exit() };
    const next = this.nextItem;
    if (!riding && next && next.target && next.action) return { key: `go:${next.target}`, label: "Go", icon: "go", run: next.action.run, aria: `Go: ${next.title}` };
    return { key: "today", label: "Today", icon: "today", run: () => this.sheetToday() };
  }
  renderBar() {
    const c = this.contextMode(), b = this.$("ctx-btn");
    if (c.key !== this.ctxKey) {
      this.ctxKey = c.key;
      replace(b.querySelector(".tab-icon"), icon(c.icon));
      b.querySelector(".tab-label").textContent = c.label;
      b.setAttribute("aria-label", c.aria || c.label);
      b.classList.toggle("stop", c.key === "stop");
    }
    const kind = this.sheet && this.sheet.kind;
    this.$("places-btn").setAttribute("aria-pressed", String(kind === "places"));
    this.$("you-btn").setAttribute("aria-pressed", String(kind === "needs"));
    const face = this.$("you-face"), id = this.world.selfId;
    if (id && face.dataset.who !== id) {
      face.dataset.who = id; replace(face, avatar(id, this.world.selfName));
      this.$("game-title").textContent = `Livéra, playing ${this.world.selfName}`;
    }
  }
  runContext() { const c = this.contextMode(); if (c.run) c.run(); else this.sheetToday(); }

  // "Doing now": what the game is waiting on for you, with Stop when it can be stopped.
  renderDoing(now) {
    const g = this.game, w = this.world, s = w.self, box = this.$("doing");
    let text = null, stop = false;
    if (s && w.self.pos) {
      const p = g.pending, me = w.selfPos(now), speed = w.rules.walk_speed_mps || 6;
      const left = s.target ? dist(me, s.target) / (s.mode === "bus" && s.speed ? s.speed : speed) : 0;
      if (p && p.kind === "enter") { const pl = w.placeById.get(p.place); text = [`Walking to ${pl ? pl.name : "the door"}`, left]; stop = true; }
      else if (p && p.kind === "ride") { const st = w.stopById(p.stop), to = w.stopById(p.to); text = [`Walking to the ${st ? st.name : ""} stop, then riding to ${to ? to.name : "your stop"}`, left]; stop = true; }
      else if (p && (p.kind === "interact" || p.kind === "ask")) { text = [`Walking over to ${firstName(w.nameOf(p.target))}`, left]; stop = true; }
      else if (s.mode === "bus" && s.target) { const to = g.riding && w.stopById(g.riding); text = [`Riding to ${to ? to.name : "your stop"}`, left]; }
      else if (s.target && !s.inside) { text = ["Walking", left]; stop = true; }
      else if (s.inside && s.onShift && (!this.sheet || this.sheet.kind !== "scene")) {
        const since = g.shiftStart != null && w.minute(now) !== null ? w.minute(now) - g.shiftStart : null;
        text = [`On shift${w.here ? ` at ${w.here.name}` : ""}${since !== null ? ` · ${fmtMin(since)}` : ""}`, 0];
      } else if (s.inside && w.school && w.school.enrolled && w.school.enrolled.studying && (!this.sheet || this.sheet.kind !== "scene")) text = ["Studying", 0];
    }
    const key = text ? `${text[0]}|${etaText(text[1])}|${stop}` : "";
    if (key === this.doingKey) return;
    this.doingKey = key;
    box.hidden = !text;
    if (text) replace(box, el("span", { class: "dot", "aria-hidden": "true" }), el("span", { class: "doing-text" }, text[0], text[1] >= 1 ? el("span", { class: "eta" }, ` · ${etaText(text[1])}`) : null),
      stop ? el("button", { type: "button", class: "btn", id: "doing-stop", onclick: () => g.stop() }, "Stop") : null);
    this.measure();
  }

  // The Next card (today.js decides what it says), and the first-morning row under it.
  agendaChanged() { this.lastNext = 0; }
  renderNext() {
    const g = this.game, box = this.$("next");
    if (g.phase !== "playing" || !this.world.self) { box.hidden = true; return; }
    const item = g.agenda.next(), morning = g.firstMorning.strip();
    this.nextItem = item;
    const key = item ? [item.kind, item.eyebrow, item.title, item.detail, item.action && item.action.label].join("|") : "";
    const mkey = morning ? morning.textContent : "";
    const hide = this.narrow() && (this.talkOpen || (this.sheet && this.sheet.kind !== "scene-mini"));
    if (key + mkey === this.nextKey && box.hidden === (hide || (!item && !morning))) return;
    this.nextKey = key + mkey;
    box.hidden = hide || (!item && !morning);
    box.classList.toggle("need-urgent", !!(item && item.urgent));
    replace(box, item ? el("div", { class: "next-main" }, g.agenda.card(item)) : null, morning);
    const text = box.querySelector(".next-text");
    if (text) { text.setAttribute("role", "button"); text.tabIndex = 0; text.setAttribute("aria-label", "Open Today"); text.onclick = () => this.sheetToday(); text.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.sheetToday(); } }; text.style.cursor = "pointer"; }
    this.measure();
  }

  // The attribution line: the short form on phones, the full sentences on wider screens and on a tap.
  renderAttrib() {
    const solo = this.$("solo-note"), together = this.$("together-note");
    const extra = solo && solo.textContent ? "single-player" : together && together.textContent ? (/^You're hosting/.test(together.textContent) ? "hosted in this tab" : "hosted in a friend's tab") : "";
    const short = `2.5D sketch preview${extra ? ` · ${extra}` : " · street layout and buildings are sketches"}`;
    if (this.$("attrib-short").textContent !== short) this.$("attrib-short").textContent = short;
  }
  toggleAttrib(force) {
    const pop = this.$("attrib-pop"), btn = this.$("attrib-btn"), open = force === undefined ? pop.hidden : force;
    pop.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const notes = [...document.querySelectorAll(".attrib-full .sketch-note")].map(n => n.textContent).filter(Boolean);
      replace(pop, el("div", { class: "eyebrow" }, "What this is"), notes.map(t => el("p", null, t)),
        el("p", { class: "hint" }, "Door positions, names, prices, opening status, bus stops and everyone's movements come from the game itself; its rules decide every outcome."),
        el("button", { type: "button", class: "btn block", onclick: () => this.toggleAttrib(false) }, "Close"));
      pop.querySelector("button").focus();
    } else if (force === false) btn.focus();
  }

  // ------------------------------------------------------------------ feed, toasts and the log
  line(who, text, kind = "say") {
    const cat = SPEECH.has(kind) ? "speech" : "activity";
    this.history.push({ who, text, kind, cat, at: Date.now() });
    if (this.history.length > 300) this.history.shift();
    this.addFeed(el("div", { class: `line ${kind}`, dataset: { kind } }, who ? el("b", null, who) : null, text), cat === "speech" ? 14000 : 9000);
    if (cat === "speech" && (kind !== "whispering")) this.heardSomething();
    if (this.sheet && this.sheet.kind === "log") this.sheetLog(true);
  }
  // A result or a refusal: a toast and a line in the Activity log. `bad`: true (a refusal) or
  // "alarm" (a need about to fail). opts: action {label, run}, ms, log (false: not logged).
  toast(text, bad = false, opts = {}) {
    const a = opts.action;
    const node = el("div", { class: `line toast${bad ? " bad" : ""}${bad === "alarm" ? " alarm" : ""}${a ? " with-action" : ""}`, role: bad ? "alert" : null },
      a ? el("span", { class: "grow" }, text) : text,
      a ? el("button", { type: "button", class: "btn small act", onclick: () => { node.remove(); a.run(); } }, a.label) : null);
    this.addFeed(node, opts.ms || (bad ? 6500 : a ? 7000 : 3500));
    if (opts.log !== false) {
      this.history.push({ who: "", text, kind: bad ? "refusal" : "result", cat: "activity", at: Date.now() });
      if (this.history.length > 300) this.history.shift();
      if (this.sheet && this.sheet.kind === "log") this.sheetLog(true);
    }
    if (!bad) this.announce(text);
    return node;
  }
  // A story line (an accident and its aftermath): one card in the display italic; notes arriving
  // within 2 s join it instead of stacking up.
  story(text) {
    const now = Date.now(), last = this.lastStory;
    this.history.push({ who: "", text, kind: "story", cat: "activity", at: now });
    if (last && last.node.isConnected && now - last.at < 2000) { last.node.append(" ", text); last.at = now; return; }
    const node = el("div", { class: "line story", role: "status" }, text);
    this.lastStory = { node, at: now };
    this.addFeed(node, 9000);
    this.announce(text);
  }
  addFeed(node, ms) {
    const feed = this.$("feed");
    feed.appendChild(node);
    while (feed.children.length > 3) feed.removeChild(feed.firstChild);
    setTimeout(() => node.classList.add("fade"), ms);
    setTimeout(() => node.remove(), ms + 700);
  }
  // A refusal in plain words, with a next step when there is one. Returns r.ok.
  refusal(r, what, ctx = {}) {
    if (r.ok) return true;
    const e = explain(r, { what, minute: this.world.minute(), here: this.world.here && this.world.here.name, exit: () => this.game.exit(), stop: () => this.game.stop(), ...ctx });
    this.toast(e.text, true, e.action ? { action: e.action, ms: 8000 } : {});
    return false;
  }
  // A pay stub in place of the two "shift ended" toasts: hours, pay, performance, the calls you made.
  payStub(d, where) {
    if (!d) return;
    const mins = Number(d.minutes_worked) || 0, paid = typeof d.pay_cents === "number";
    const rows = [["Worked", fmtMin(mins)]];
    if (d.title) rows.push(["As", d.title]);
    if (typeof d.performance === "number") rows.push(["Performance", String(d.performance)]);
    if (Array.isArray(d.decisions) && d.decisions.length) rows.push(["Work calls", `${d.best_calls || 0} of ${d.decisions.length} best`]);
    if (d.decision_bonus_hours) rows.push(["Toward promotion", `+${d.decision_bonus_hours} h from calls`]);
    const node = el("div", { class: "line stub", role: "status" },
      el("div", { class: "stub-head" }, lotus(), el("b", null, `Pay stub${where ? ` · ${where}` : ""}`)),
      el("div", { class: "stub-pay" }, paid ? `Paid ${money(d.pay_cents)}` : "Shift ended"),
      el("dl", null, rows.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)])),
      d.note ? el("p", { class: "note" }, sentence(d.note)) : null,
      d.decisions_note ? el("p", { class: "note" }, sentence(d.decisions_note)) : null);
    this.addFeed(node, 12000);
    const text = `Shift ended · ${fmtMin(mins)}${paid ? ` · paid ${money(d.pay_cents)}` : ""}${d.note ? ` · ${d.note}` : ""}`;
    this.history.push({ who: "", text, kind: "result", cat: "activity", at: Date.now() });
    this.announce(text);
    this.game.stubAt = performance.now();
    if (d.promoted_to) this.banner("Promoted", d.promoted_to, "Your new title starts on your next shift.");
  }
  // A promotion stays on screen until it's tapped.
  banner(eyebrow, title, hint) {
    const b = this.$("banner");
    replace(b, el("button", { type: "button", "aria-label": `${eyebrow}: ${title}. Dismiss`, onclick: () => { b.hidden = true; } },
      lotus(), el("span", { class: "grow" }, el("span", { class: "eyebrow" }, eyebrow), el("span", { class: "banner-title" }, title), hint ? el("span", { class: "hint" }, hint) : null)));
    b.hidden = false;
    this.history.push({ who: "", text: `${eyebrow}: ${title}`, kind: "result", cat: "activity", at: Date.now() });
    this.announce(`${eyebrow}: ${title}`);
    this.game.bannerAt = performance.now();
  }
  heardSomething() {
    if (this.talkOpen || !this.narrow()) return;
    this.talkUnread++;
    const c = this.$("talk-count");
    c.hidden = false; c.textContent = String(Math.min(99, this.talkUnread));
    this.$("talk-btn").setAttribute("aria-label", `Talk, ${this.talkUnread} new`);
    this.coach.show("talk", "talk-btn");
  }

  // ------------------------------------------------------------------ Talk: the composer, docked
  layoutTalk() { this.setTalk(this.talkOpen); }
  setTalk(open) {
    this.talkOpen = !!open;
    const bar = this.$("chatbar"), narrow = this.narrow();
    bar.hidden = this.$("dock").hidden || (narrow && !this.talkOpen);
    this.$("talk-btn").setAttribute("aria-expanded", String(!bar.hidden));
    if (!bar.hidden && this.talkOpen) {
      this.talkUnread = 0; this.$("talk-count").hidden = true; this.$("talk-btn").setAttribute("aria-label", "Talk");
    }
    this.nextKey = ""; this.renderNext();
    this.measure();
  }
  openTalk(focus = false) {
    this.setTalk(true);
    if (focus) this.$("chat-input").focus();
  }
  toggleTalk() {
    if (!this.narrow()) { this.setTalk(true); this.$("chat-input").focus(); return; }
    if (this.talkOpen) this.setTalk(false); else this.openTalk(false);
  }
  setVolume(v, quiet) {
    this.volume = v;
    for (const b of document.querySelectorAll("#chatbar [data-volume]")) b.setAttribute("aria-pressed", String(b.dataset.volume === v));
    this.$("whisper-targets").hidden = v !== "whisper";
    this.$("chat-input").placeholder = v === "whisper" ? "Whisper something" : v === "shout" ? "Shout something" : "Say something";
    if (v === "whisper") { this.targetsKey = ""; this.renderTargets(); } else { this.whisperTo = null; this.$("chat-send").disabled = false; }
    this.renderRangeNote();
    if (!quiet) this.renderer.setRing(v);
    if (document.activeElement === this.$("chat-input")) this.renderer.ringHold = v;
  }
  // Whisper only offers people close enough to hear it (indoors: anyone in the building); with
  // nobody there, Send waits.
  renderTargets() {
    const w = this.world, inRange = w.peopleWithin(w.rules.whisper_range_m);
    if (this.whisperTo && !inRange.some(p => p.id === this.whisperTo)) this.whisperTo = null;
    if (!this.whisperTo && inRange.length === 1) this.whisperTo = inRange[0].id;
    this.$("chat-send").disabled = this.volume === "whisper" && !this.whisperTo;
    const key = inRange.map(p => p.id).join() + "|" + this.whisperTo;
    if (key === this.targetsKey) return;
    this.targetsKey = key;
    const box = this.$("whisper-targets");
    if (!inRange.length) {
      replace(box, el("span", null, `Nobody within ${w.rules.whisper_range_m} m to whisper to. Walk right up to someone.`));
      return;
    }
    replace(box, el("span", null, "To:"), inRange.map(p => el("button", {
      type: "button", class: "target", "aria-pressed": String(p.id === this.whisperTo), dataset: { person: p.id },
      onclick: () => { this.whisperTo = p.id; this.targetsKey = ""; this.renderTargets(); },
    }, avatar(p.id, p.name), firstName(p.name))));
  }
  whisperToPerson(id) {
    this.openTalk(false);
    this.setVolume("whisper");
    if (this.world.peopleWithin(this.world.rules.whisper_range_m).some(p => p.id === id)) { this.whisperTo = id; this.targetsKey = ""; this.renderTargets(); }
    else this.toast(`Walk right up to ${firstName(this.world.nameOf(id))} to whisper (${this.world.rules.whisper_range_m} m).`, false, { log: false });
    this.$("chat-input").focus();
  }
  async sendChat() {
    const input = this.$("chat-input"), text = input.value.trim();
    if (!text) return;
    if (this.volume === "whisper" && !this.whisperTo) { this.toast("Pick who to whisper to.", true); return; }
    const to = this.volume === "whisper" ? this.whisperTo : undefined;
    const r = await this.game.say(text, this.volume, to);
    if (!r.ok) { this.refusal(r); return; }
    input.value = "";
    this.history.push({ who: this.volume === "whisper" ? `You (to ${firstName(this.world.nameOf(to))})` : "You", text, kind: this.volume, cat: "speech", at: Date.now() });
    const heard = Number(r.data.heard_by) || 0;
    this.toast(this.volume === "whisper" ? `Whispered to ${firstName(this.world.nameOf(to))}` : heard ? `Heard by ${heard}` : "Nobody heard you", false, { log: false });
  }

  // ------------------------------------------------------------------ cards (sheets)
  // opts: height ("peek" | "half" | "full"), focus (false: don't move focus, for cards the game opens).
  openSheet(kind, id, head, body, update, opts = {}) {
    const sheet = this.$("sheet"), was = this.sheet;
    const active = document.activeElement;
    if (!was && active && active !== document.body && !sheet.contains(active)) this.opener = active;
    const titleId = `sheet-title-${kind}`;
    const closeBtn = el("button", { type: "button", class: "iconbtn", "aria-label": "Close", onclick: () => this.closeSheet(false, true) }, icon("close"));
    const height = opts.height || (was && was.kind === kind ? sheet.dataset.height : null) || DEFAULT_HEIGHT[kind] || "half";
    const sizeBtn = el("button", { type: "button", class: "iconbtn sheet-size", "aria-label": height === "full" ? "Make the card smaller" : "Make the card bigger", onclick: () => this.setHeight(sheet.dataset.height === "full" ? "half" : "full") }, icon(height === "full" ? "down" : "up"));
    const headNode = el("div", { class: "sheet-head" }, head, kind === "menu" ? null : sizeBtn, closeBtn);
    replace(sheet, el("div", { class: "sheet-grip", "aria-hidden": "true" }), headNode, el("div", { class: "sheet-body" }, body));
    const h2 = headNode.querySelector("h2");
    if (h2) { h2.id = titleId; h2.tabIndex = -1; sheet.setAttribute("aria-labelledby", titleId); } else sheet.removeAttribute("aria-labelledby");
    sheet.hidden = false; sheet.classList.remove("mini"); sheet.dataset.kind = kind; sheet.dataset.height = height; sheet.scrollTop = 0;
    document.getElementById("app").classList.add("sheet-open");
    this.sheet = { kind, id, update };
    this.renderer.select(kind === "place" || kind === "person" || kind === "stop" ? { kind, id } : null);
    this.attachDrag(sheet);
    if (update) update(performance.now());
    if (opts.focus !== false && h2 && !this.game.phoneUI.open) h2.focus({ preventScroll: true });
    this.nextKey = ""; this.renderNext();
    this.measure();
    if (this.narrow()) setTimeout(() => this.coach.show("sheet", sheet.querySelector(".sheet-head")), 600);
  }
  setHeight(h) {
    const sheet = this.$("sheet");
    if (!HEIGHTS.includes(h) || sheet.hidden) return;
    sheet.dataset.height = h; sheet.style.height = ""; sheet.style.maxHeight = "";
    const b = sheet.querySelector(".sheet-size");
    if (b) { replace(b, icon(h === "full" ? "down" : "up")); b.setAttribute("aria-label", h === "full" ? "Make the card smaller" : "Make the card bigger"); }
    this.measure();
  }
  // Drag the card's top edge (the grip and the title row) between peek, half and full on phones.
  attachDrag(sheet) {
    if (sheet.dataset.drag) return;
    sheet.dataset.drag = "1";
    let start = null;
    sheet.addEventListener("pointerdown", e => {
      if (!this.narrow() || sheet.classList.contains("mini")) return;
      const head = e.target.closest(".sheet-grip, .sheet-head");
      if (!head || e.target.closest("input, select, textarea")) return;
      start = { y: e.clientY, h: sheet.offsetHeight, moved: false, id: e.pointerId };
    });
    sheet.addEventListener("pointermove", e => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dy) < 8) return;
      if (!start.moved) { start.moved = true; try { sheet.setPointerCapture(e.pointerId); } catch { /* ignore */ } sheet.classList.add("dragging"); }
      const max = window.innerHeight - (parseFloat(getComputedStyle(document.getElementById("app")).getPropertyValue("--base-h")) || 0) - 60;
      sheet.style.maxHeight = "none";
      sheet.style.height = `${Math.max(90, Math.min(max, start.h - dy))}px`;
      this.measure();
    });
    const end = e => {
      if (!start || e.pointerId !== start.id) return;
      const moved = start.moved, h = sheet.offsetHeight;
      start = null; sheet.classList.remove("dragging");
      if (!moved) return;
      // A drag ends a click: the button under the finger doesn't fire.
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 50);
      const H = window.innerHeight;
      if (h < 120 && this.sheet && this.sheet.kind !== "request") { sheet.style.height = ""; sheet.style.maxHeight = ""; this.closeSheet(); return; }
      this.setHeight(h < H * 0.34 ? "peek" : h < H * 0.62 ? "half" : "full");
    };
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  }
  // Inside a building, closing a card goes back to the scene pill, so Exit is always on screen.
  // `force` really hides it (leaving the game, or once you're outside).
  closeSheet(force = false, byUser = false) {
    const w = this.world, had = !!this.sheet;
    if (!force && w.self && w.self.inside && w.here) { this.miniScene(); this.restoreFocus(byUser); return; }
    const sheet = this.$("sheet");
    sheet.hidden = true; clear(sheet); delete sheet.dataset.kind; sheet.style.height = ""; sheet.style.maxHeight = "";
    this.sheet = null; this.renderer.select(null);
    document.getElementById("app").classList.remove("sheet-open");
    this.nextKey = ""; if (had) this.renderNext();
    this.measure();
    this.restoreFocus(byUser);
  }
  restoreFocus(byUser) {
    const o = this.opener;
    this.opener = null;
    if (byUser && o && o.isConnected && o.offsetParent !== null) o.focus({ preventScroll: true });
  }
  head(eyebrow, title, extra) {
    return el("div", { class: "grow" }, eyebrow ? el("div", { class: "eyebrow" }, eyebrow) : null, el("h2", null, title), extra || null);
  }

  // The street verbs verbs.js finds for a person (pickpocket, fight: risk first), in a "Street" section in the danger
  // style (empty: nothing shown). D-069, D-070.
  async personSection(box, person) {
    let mod = null;
    try { mod = await import("./verbs.js"); } catch { mod = null; }
    if (!mod || typeof mod.personActions !== "function" || !box.isConnected) return;
    let actions = [];
    try { actions = await mod.personActions(this.game, person); } catch { actions = []; }
    if (!box.isConnected || !Array.isArray(actions) || !actions.length) return;
    replace(box, el("div", { class: "eyebrow" }, "Street"), el("ul", { class: "list" }, actions.map(a => el("li", null,
      el("button", { type: "button", class: "btn block danger", dataset: { verb: a.key }, onclick: async e => {
        const b = e.currentTarget; b.disabled = true;
        try { await mod.runAction(this.game, a); } finally { if (b.isConnected) b.disabled = false; }
      } }, a.label), a.detail ? el("p", { class: "hint" }, a.detail) : null))));
    box.hidden = false;
  }

  // The verbs engineer B's verbs.js finds for a place, in a "Do" section (empty: nothing shown).
  async doSection(box, place) {
    let mod = null;
    try { mod = await import("./verbs.js"); } catch { mod = null; }
    if (!mod || typeof mod.placeActions !== "function" || !box.isConnected) return;
    if (typeof mod.exposeForTests === "function") mod.exposeForTests(this.game);
    let actions = [];
    try { actions = await mod.placeActions(this.game, place); } catch { actions = []; }
    if (!box.isConnected || !Array.isArray(actions) || !actions.length) return;
    const run = async (a, btn) => {
      btn.disabled = true;
      try {
        const r = typeof mod.runAction === "function" ? await mod.runAction(this.game, a) : await a.run();
        if (r && r.ok && this.sheet && (this.sheet.kind === "scene" || this.sheet.kind === "place")) {
          if (this.sheet.kind === "scene") this.sheetScene(); else this.sheetPlace(this.sheet.id);
        }
      } finally { if (btn.isConnected) btn.disabled = false; }
    };
    replace(box, el("div", { class: "eyebrow" }, "Do"), el("ul", { class: "list" }, actions.map(a => el("li", null,
      el("button", { type: "button", class: `btn block${a.primary ? " primary" : ""}${a.danger ? " danger" : ""}`, dataset: { verb: a.key || a.label }, onclick: e => run(a, e.currentTarget) }, a.label),
      a.detail ? el("p", { class: "hint" }, a.detail) : null))));
    box.hidden = false;
  }

  // A building or open space on the map (outside).
  sheetPlace(id) {
    const w = this.world, b = w.buildingById.get(id) || w.buildingOfPlace.get(id), pl = w.placeById.get(id);
    const target = b || (pl && { id: pl.id, name: pl.name, type: pl.type, district: pl.district, door: pl.door, status: pl.status, enterable: false });
    if (!target) return;
    const a = this.game.agenda, homeId = a.homeId(), home = homeId && (homeId === target.id || (target.units || []).some(u => u.id === homeId));
    const work = a.workplaces().some(p => p.id === target.id);
    const placeholder = target.type === "civic" && target.enterable === false;
    const place = w.placeById.get(target.id) || pl || null, hours = place ? openingText(place, w.minute()) : null;
    const status = target.status === "under_construction" ? ["building", "under construction"] : target.status === "closed" ? ["closed", "closed"] : ["open", "open"];
    const distText = el("p", { class: "hint" });
    const body = [];
    body.push(el("div", { class: "row" }, el("span", { class: `badge ${status[0]}` }, status[1]),
      hours ? el("span", { class: "hint" }, hours.text) : null,
      placeholder ? el("span", { class: "badge sketch" }, "placeholder landmark") : null));
    if (placeholder) body.push(el("p", { class: "hint" }, "A landmark only: there is nothing to do here yet."));
    const site = (w.nearby || []).find(n => n.construction && (n.id === `${target.id}_site` || n.id === target.id));
    const proj = w.projects.get(target.id);
    if (site || proj) {
      const c = site ? site.construction : null;
      body.push(el("p", { class: "hint" }, `${c ? c.project : proj.name}: ${c ? c.progress_pct : proj.progress_pct}% built${c ? ` · crew ${c.crew_on_site} on site · works ${c.crew_hours}` : ""}`));
    }
    body.push(distText);
    if (target.units) {
      if (home) body.push(el("button", { type: "button", class: "btn primary block", onclick: () => this.game.goInside(homeId) }, icon("home"), "Go home"));
      body.push(el("details", { class: "more", open: !home }, el("summary", null, `Homes in this building (${target.units.length})`), el("div", { class: "more-body" },
        el("ul", { class: "list" }, target.units.map(u => el("li", null,
          el("div", { class: "offer-head" }, el("span", null, u.name), el("span", { class: "hint" }, u.id === homeId ? "Your home" : typeName(u.type))),
          el("button", { type: "button", class: "btn small", onclick: () => this.game.goInside(u.id) }, "Go inside")))),
        el("p", { class: "hint" }, "Residents only: the server lets you into your own home, or a home you're invited into."))));
    } else if (target.enterable && target.status !== "under_construction") {
      body.push(el("button", { type: "button", class: "btn primary block", onclick: () => this.game.goInside(target.id) }, icon("go"), "Go inside"));
    }
    body.push(el("button", { type: "button", class: "btn link", onclick: () => this.game.walkTo(target.door) }, "Just walk there"));
    const doBox = el("div", { class: "stack", hidden: true });
    body.push(doBox);
    this.openSheet("place", target.id, this.head(`${typeName(target.shape || target.type)}${target.district ? " · " + target.district : ""}`, target.name), body, now => {
      const me = w.selfPos(now);
      if (!me) { distText.textContent = ""; return; }
      if (w.self.inside) { distText.textContent = "You're inside somewhere: exit first."; return; }
      const d = dist(me, target.door), s = d / (w.rules.walk_speed_mps || 6);
      distText.textContent = [home ? "Your home" : work ? "Your workplace" : "", `${Math.round(d)} m · about ${s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`} on foot`].filter(Boolean).join(" · ");
    });
    this.doSection(doBox, target.units ? target : (place || target));
  }

  // The scene inside a building: buy, things to do, work, study, who's here, about, exit.
  sheetScene(opts = {}) {
    const w = this.world, here = w.here, g = this.game;
    if (!here) return;
    g.agenda.learnHere(here);
    const m = w.minute();
    const peopleBox = el("div", { class: "people" });
    const updatePeople = () => {
      const inside = [...w.people.values()].filter(p => p.inside === w.self.inside || (!p.pos && w.self.inside));
      const key = inside.map(p => p.id + (p.scripted ? "s" : "")).join();
      if (peopleBox.dataset.key === key) return;
      peopleBox.dataset.key = key;
      replace(peopleBox, inside.length ? inside.map(p => this.personChip(p)) : el("span", { class: "hint" }, "Nobody else is here."));
    };
    updatePeople();
    const body = [];
    const place = w.placeById.get(here.id), hours = place ? openingText(place, m) : null;
    body.push(el("div", { class: "row" }, el("span", { class: `badge ${here.status === "open" ? "open" : "closed"}` }, String(here.status || "open").replace(/_/g, " ")),
      hours ? el("span", { class: "hint" }, hours.text) : null, w.self.onShift ? el("span", { class: "badge open" }, "on shift") : null));
    // Buy: the way to pay chosen once (remembered on this device), one button per offer.
    if (Array.isArray(here.offers) && here.offers.length) {
      const offerBtns = [];
      const seg = el("div", { class: "seg", role: "group", "aria-label": "Pay with" }, [["card", "Card"], ["cash", "Cash"], ["phone", "LivPay"]].map(([k, label]) =>
        el("button", { type: "button", "aria-pressed": String(k === this.payMethod), dataset: { pay: k }, onclick: () => {
          this.payMethod = k; store.set("livera.payWith", k);
          for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.pay === k));
          for (const b of offerBtns) b.dataset.method = k;
        } }, label)));
      body.push(el("div", { class: "eyebrow" }, "Buy"), el("div", { class: "paywith" }, el("span", { class: "hint" }, "Pay with"), seg));
      body.push(el("ul", { class: "list" }, here.offers.map(o => {
        const fx = effectsText(o.needs);
        const btn = el("button", { type: "button", class: "btn", dataset: { buy: o.id, method: this.payMethod }, "aria-label": `Buy ${o.label} for ${money(o.price_cents)}`,
          onclick: () => g.buy(o, btn.dataset.method) }, `Buy · ${money(o.price_cents)}`);
        offerBtns.push(btn);
        return el("li", { class: "offer" }, el("div", { class: "grow" }, el("div", null, o.label), fx ? el("div", { class: "fx" }, fx) : null), btn);
      })));
    }
    if (Array.isArray(here.activities) && here.activities.length) {
      body.push(el("div", { class: "eyebrow" }, "Things to do"));
      body.push(el("div", { class: "acts" }, here.activities.map(a => {
        const local = this.cooling.get(`${here.id}/${a.id}`), wait = a.ready_in_minutes > 0 ? a.ready_in_minutes : local && m !== null && local > m ? local - m : 0;
        const fx = effectsText(a.needs, 2);
        return el("button", { type: "button", class: `btn act-btn${wait ? " cooling" : ""}`, dataset: { activity: a.id }, "aria-label": `${a.label}${fx ? `: ${fx}` : ""}${wait ? `, again in about ${fmtMin(wait)}` : ""}`, onclick: () => g.activity(a) },
          el("span", null, a.label), wait ? el("span", { class: "fx" }, `again in about ${fmtMin(wait)}`) : fx ? el("span", { class: "fx" }, fx) : null);
      })));
    }
    const doBox = el("div", { class: "stack", hidden: true });
    body.push(doBox);
    // Work: one button that follows the shift (R1.1's strip: time, an estimate of pay, decisions).
    const career = w.career, works = w.self.onShift || (career && Array.isArray(career.workplaces) && career.workplaces.includes(here.name));
    let shiftLine = null;
    if (works) {
      shiftLine = el("p", { class: "hint", id: "shift-line" });
      const decisions = g.agenda.work && Number(g.agenda.work.open) > 0 ? Number(g.agenda.work.open) : 0;
      body.push(el("div", { class: "eyebrow" }, `Work${career && career.title ? " · " + career.title : ""}`));
      body.push(el("div", { class: "shiftbox" }, shiftLine,
        w.self.onShift && decisions ? el("button", { type: "button", class: "btn block", onclick: () => g.openPhone("work") }, icon("workdesk"), `${decisions} decision${decisions > 1 ? "s" : ""} waiting`) : null,
        w.self.onShift ? el("button", { type: "button", class: "btn block", id: "shift-btn", onclick: () => g.work("end") }, "End shift")
          : el("button", { type: "button", class: "btn primary block", id: "shift-btn", onclick: () => g.work("start") }, "Start shift")));
    }
    // Study where the server would allow it: at a campus of the program you're enrolled in (the
    // school app names programs and campuses, not ids). Not enrolled: the programs taught here.
    const school = w.school, programs = school && Array.isArray(school.programs) ? school.programs : [];
    const taughtHere = p => Array.isArray(p.campuses) && p.campuses.includes(here.name);
    const enrolled = school && school.enrolled, mine = enrolled && programs.find(p => p.name === enrolled.program);
    if (enrolled && ((mine && taughtHere(mine)) || enrolled.studying)) {
      body.push(el("div", { class: "eyebrow" }, "Study"));
      body.push(el("p", { class: "hint" }, `${enrolled.program}: ${enrolled.hours ?? 0} of ${enrolled.hours_required ?? "?"} hours${enrolled.studying ? " · studying now" : ""}`));
      body.push(enrolled.studying ? el("button", { type: "button", class: "btn block", onclick: () => g.study("end") }, "End studying")
        : el("button", { type: "button", class: "btn primary block", onclick: () => g.study("start") }, "Start studying"));
    } else if (!enrolled && programs.some(taughtHere)) {
      const open = programs.filter(p => taughtHere(p) && p.eligible && p.id);
      body.push(el("div", { class: "eyebrow" }, "Study here"));
      if (open.length) {
        body.push(el("ul", { class: "list" }, open.map(p => el("li", null,
          el("div", { class: "offer-head" }, el("span", null, p.name), el("span", { class: "price" }, `${money(p.tuition_per_hour_cents)}/hr`)),
          el("div", { class: "hint" }, `${p.hours_required} hours of study; tuition is paid per hour studied.`),
          el("button", { type: "button", class: "btn small", dataset: { enroll: p.id }, onclick: () => g.enroll(p) }, "Enroll")))));
      } else body.push(el("p", { class: "hint" }, "No program taught here is open to you (the school app says what each one needs)."));
    }
    body.push(el("div", { class: "eyebrow" }, "Here with you"), peopleBox);
    if (here.description) body.push(el("details", { class: "more" }, el("summary", null, "About this place"), el("div", { class: "more-body" }, el("p", { class: "desc" }, here.description))));
    body.push(el("button", { type: "button", class: "btn primary block", id: "exit-btn", onclick: () => g.exit() }, icon("exit"), "Exit"));
    const head = this.head(typeName(here.type), here.name);
    const update = now => {
      updatePeople();
      if (shiftLine) {
        const mm = w.minute(now), since = g.shiftStart != null && mm !== null ? mm - g.shiftStart : null, c = w.career;
        shiftLine.textContent = !w.self.onShift ? `${c && c.hourly_cents ? `${money(c.hourly_cents)}/hr · ` : ""}paid for the hours you work when you end the shift.`
          : since !== null ? `On shift · ${fmtMin(since)}${c && c.hourly_cents ? ` · about ${money(Math.round(c.hourly_cents * since / 60))} so far (estimate, paid at End shift)` : ""}`
          : "On shift · paid for the hours worked at End shift.";
      }
    };
    this.openSheet("scene", here.id, head, body, update, { focus: opts.focus, height: opts.height });
    // The scene card can shrink to a pill so the map shows.
    const headNode = this.$("sheet").querySelector(".sheet-head");
    headNode.insertBefore(el("button", { type: "button", class: "iconbtn", "aria-label": "Shrink to a pill", onclick: () => this.miniScene() }, icon("down")), headNode.lastChild);
    const size = headNode.querySelector(".sheet-size");
    if (size) size.remove();
    this.doSection(doBox, here);
  }
  miniScene() {
    const w = this.world, sheet = this.$("sheet");
    if (!w.here) return;
    replace(sheet, el("div", { class: "mini-pill" },
      el("button", { type: "button", class: "btn grow", "aria-label": `Inside ${w.here.name}: open the card`, onclick: () => this.sheetScene() }, `Inside: ${w.here.name}`, icon("up")),
      el("button", { type: "button", class: "btn", onclick: () => this.game.exit() }, "Exit")));
    sheet.hidden = false; sheet.dataset.kind = "scene-mini"; sheet.dataset.height = "peek"; sheet.style.height = ""; sheet.style.maxHeight = "";
    sheet.removeAttribute("aria-labelledby"); sheet.setAttribute("aria-label", `Inside ${w.here.name}`);
    this.renderer.select(null);
    sheet.classList.add("mini");
    document.getElementById("app").classList.remove("sheet-open");
    this.sheet = { kind: "scene-mini", id: w.here.id };
    this.nextKey = ""; this.renderNext();
    this.measure();
  }

  personChip(p) {
    return el("button", { type: "button", class: "person", dataset: { person: p.id }, onclick: () => this.sheetPerson(p.id) },
      avatar(p.id, p.name), firstName(p.name), p.scripted ? el("span", { class: "badge script" }, "script") : null);
  }

  // Someone you can see: talk first (warmest first), then give or pay and asks, folded away.
  sheetPerson(id) {
    const w = this.world, p = w.people.get(id), g = this.game;
    if (!p) { this.toast("They're out of sight now.", false, { log: false }); return; }
    const distText = el("span", { class: "hint" }), metText = el("span", { class: "hint" });
    const solo = document.body.dataset.boot === "solo";
    const body = [];
    body.push(el("div", { class: "row" }, avatar(id, p.name, "big"), el("div", { class: "stack grow", style: { gap: "4px" } },
      p.scripted ? el("span", null, el("span", { class: "badge script" }, "played by a script")) : null,
      p.uniform === "police" ? el("span", null, el("span", { class: "badge police" }, "police officer on duty")) : null, metText, distText)));
    if (p.scripted) body.push(el("p", { class: "hint" }, "A script chooses where this character goes and what they do; the game's rules decide every outcome, as for everyone."));
    // A figure that isn't their picture says so (D-067, D-073).
    const art = artStatus(id);
    if (art === "standin") body.push(el("p", { class: "hint", dataset: { art: "standin" } }, "No picture of them yet: they're drawn as a stand-in in their own colours until their art is made."));
    else if (art === "plain") body.push(el("p", { class: "hint", dataset: { art: "plain" } }, "Drawn as a stand-in: the game doesn't show other players how a made character looks."));
    body.push(el("div", { class: "eyebrow" }, "Talk"));
    if (w.interactions && w.interactions.length) {
      const order = i => { const k = WARMTH.indexOf(i.id); return k < 0 ? (i.id === "argue" ? 99 : 50) : k; };
      const list = [...w.interactions].sort((a, b) => order(a) - order(b));
      body.push(el("div", { class: "grid2" }, list.map(i => el("button", {
        type: "button", class: `btn small${i.id === "argue" ? " quiet" : ""}${i.id === "chat" ? " primary" : ""}`, dataset: { interaction: i.id }, onclick: () => g.interact(i, id),
      }, i.label))));
      body.push(el("p", { class: "hint" }, "Too far? You'll walk over first."));
    } else body.push(el("p", { class: "notice" }, "This server doesn't publish its list of interactions yet (it arrives with the newer protocol)."));
    body.push(el("button", { type: "button", class: "btn block", onclick: () => { this.closeSheet(); this.whisperToPerson(id); } }, `Whisper to ${firstName(p.name)}`));

    // Give or pay: a tip from your bank, LivPay from your phone, or something you own.
    const amount = el("input", { type: "number", inputmode: "decimal", min: "1", step: "1", class: "input", value: "5", "aria-label": "Dollars" });
    const note = el("input", { type: "text", class: "input", maxlength: "80", placeholder: "Note (LivPay, optional)", "aria-label": "Note" });
    const cents = () => Math.round(parseFloat(amount.value) * 100);
    const giveBox = el("div", { class: "row" }, el("span", { class: "hint" }, "Open to see your things."));
    const give = el("details", { class: "more" }, el("summary", null, "Give or pay"), el("div", { class: "more-body" },
      el("div", { class: "row" }, el("span", null, "$"), el("div", { class: "grow" }, amount)), note,
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn grow", onclick: () => g.tip(id, cents()) }, "Tip"),
        el("button", { type: "button", class: "btn grow", onclick: () => g.livpay(id, cents(), note.value.trim()) }, "Send with LivPay")),
      el("div", { class: "eyebrow" }, "Give something"), giveBox));
    give.addEventListener("toggle", () => {
      if (!give.open || giveBox.dataset.loaded) return;
      giveBox.dataset.loaded = "1";
      replace(giveBox, el("span", { class: "hint" }, "Loading your things…"));
      g.inventory().then(items => {
        if (!items) { replace(giveBox, el("span", { class: "hint" }, "Couldn't open your items.")); return; }
        if (!items.length) { replace(giveBox, el("span", { class: "hint" }, "You have nothing to give.")); return; }
        const sel = el("select", { class: "input grow", "aria-label": "Item" }, items.map(it => el("option", { value: it.id }, it.label)));
        replace(giveBox, el("div", { class: "grow" }, sel), el("button", { type: "button", class: "btn", onclick: () => g.give(id, sel.value) }, "Give"));
      });
    });
    body.push(give);

    // Asks: the other person answers. Intimacy asks about protection in a step of its own.
    const askBody = el("div", { class: "more-body" });
    const askList = () => replace(askBody,
      solo && p.scripted ? el("p", { class: "notice" }, "In single-player the autopilot says no to every ask.") : null,
      el("div", { class: "grid2" }, ASKS.map(a => el("button", { type: "button", class: "btn small", dataset: { ask: a.kind }, onclick: () => (a.kind === "intimacy" ? confirmIntimacy() : g.ask(a.kind, id)) }, a.label))),
      el("p", { class: "hint" }, "They answer yes or no; you'll walk over first. Adults-only and family rules are checked by the server when you ask and when they answer."));
    const confirmIntimacy = () => {
      const protection = el("input", { type: "checkbox", checked: true });
      replace(askBody, el("p", null, `Ask ${firstName(p.name)} for intimacy?`), el("label", { class: "choice" }, protection, "Use protection"),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn primary grow", onclick: () => { g.ask("intimacy", id, { protection: protection.checked }); askList(); } }, "Ask"),
          el("button", { type: "button", class: "btn grow", onclick: () => askList() }, "Back")));
    };
    askList();
    body.push(el("details", { class: "more" }, el("summary", null, "Ask…"), askBody));
    const streetBox = el("div", { class: "stack", hidden: true });  // street verbs (verbs.js personActions, D-069/D-070)
    body.push(streetBox);

    this.openSheet("person", id, this.head(p.known ? "Someone you know" : "Someone nearby", p.name), body, now => {
      const pp = w.people.get(id);
      metText.textContent = pp && pp.known ? "You've met." : "You haven't met yet.";
      if (!pp) { distText.textContent = "Out of sight now."; return; }
      const d = w.distanceTo(id, now);
      distText.textContent = d === 0 ? "Here with you." : isFinite(d) ? `${Math.round(d)} m away` : "";
    });
    this.personSection(streetBox, p);
  }

  // A bus stop: pick where to go (nothing is picked for you) and how to pay.
  sheetStop(id, preselect = null) {
    const w = this.world, stop = w.stopById(id), line = stop && w.lineOfStop(id);
    if (!stop || !line) return;
    const body = [], distText = el("p", { class: "hint" });
    const hours = line.first_hour != null ? `${line.first_hour}:00–${line.last_hour}:00` : "";
    body.push(el("p", { class: "hint" }, `${line.name} · fare ${money(line.fare_cents)}${hours ? ` · runs ${hours}` : ""}`));
    body.push(distText);
    const dests = line.stops.filter(s => s.id !== stop.id);
    const near = s => w.places.filter(p => p.type !== "construction_site" && dist(p.door, s.at) <= 60).sort((a, b) => dist(a.door, s.at) - dist(b.door, s.at)).slice(0, 3).map(p => p.name.replace(/, (Apt|Unit) .*$/, ""));
    let pay = this.payMethod, dodge = false;
    const ride = el("button", { type: "button", class: "btn primary block", id: "ride-btn", disabled: true, onclick: () => {
      const to = destList.querySelector("input:checked")?.value;
      if (!to) { this.toast("Pick a stop.", true); return; }
      this.game.rideFrom(stop, to, !dodge, pay);
    } }, "Pick where to go");
    const label = () => {
      const to = destList.querySelector("input:checked"), s = to && w.stopById(to.value);
      ride.disabled = !s;
      ride.textContent = s ? `Ride to ${s.name}${dodge ? " without paying" : ` · ${money(line.fare_cents)}`}` : "Pick where to go";
    };
    body.push(el("div", { class: "eyebrow" }, "Where to"));
    const destList = el("div", { class: "stack", role: "radiogroup", "aria-label": "Destination" }, dests.map(s => {
      const n = [...new Set(near(s))].filter(x => !x.startsWith(s.name) && !s.name.startsWith(x));
      return el("label", { class: "choice" }, el("input", { type: "radio", name: "dest", value: s.id, checked: s.id === preselect, onchange: label }),
        el("span", { class: "grow" }, s.name, n.length ? el("span", { class: "near" }, `near ${n.join(", ")}`) : null));
    }));
    body.push(destList);
    body.push(el("div", { class: "eyebrow" }, "Pay with"));
    const paySeg = el("div", { class: "seg", role: "group", "aria-label": "Pay with" }, [["card", "Card"], ["cash", "Cash"], ["phone", "LivPay"]].map(([k, l]) =>
      el("button", { type: "button", "aria-pressed": String(k === pay), dataset: { pay: k }, onclick: () => {
        pay = k; for (const b of paySeg.children) b.setAttribute("aria-pressed", String(b.dataset.pay === k));
      } }, l)));
    const dodgeBox = el("input", { type: "checkbox", id: "ride-dodge", onchange: () => { dodge = dodgeBox.checked; label(); } });
    const dodgeNear = el("span", { class: "near" }, "An inspector may catch you and fine you.");
    body.push(paySeg, el("label", { class: "choice danger-choice" }, dodgeBox, el("span", { class: "grow" }, "Ride without paying", dodgeNear)));
    // The inspectors' odds and the fine are the server's own numbers (crime_risk, D-069).
    this.game.req("crime_risk", { crime: "fare_evasion" }).then(r => {
      if (r.ok && typeof r.data.chance === "number" && dodgeNear.isConnected)
        dodgeNear.textContent = `Inspectors check about ${Math.round(r.data.chance * 100)}% of rides: a ${money((r.data.if_caught || {}).fine_cents || 0)} fine and fare evasion on your record if they catch you.`;
    });
    body.push(ride);
    body.push(el("p", { class: "hint" }, "Riders travel on a single-rider shuttle for now; shared buses on a timetable come later."));
    this.openSheet("stop", id, this.head(`Bus stop ${this.renderer.stopNo && this.renderer.stopNo.get(id) ? `${this.renderer.stopNo.get(id)} ` : ""}· ${line.name}`, stop.name), body, now => {
      const me = w.selfPos(now);
      if (!me) return;
      const d = dist(me, stop.at);
      distText.textContent = w.self.inside ? "Exit the building first." : d <= w.rules.boarding_radius_m ? "You're at this stop." : `${Math.round(d)} m away: you'll walk here first.`;
    });
    label();
  }

  sheetRequest(req) {
    const w = this.world, from = req.from;
    // Answered, or passed (asks expire): close it, if it's still the sheet on screen.
    const answer = async accept => {
      const r = await this.game.respond(req.id, accept);
      if ((r.ok || r.error.code === "unknown_request") && this.sheet && this.sheet.kind === "request" && this.sheet.id === req.id) this.closeSheet();
    };
    // The server says how long an ask stays open (older servers don't): shown on the game clock, like the top bar.
    const m = w.minute();
    const passes = Number.isFinite(req.expires_in_minutes) && m !== null
      ? `This ask passes at ${stamp(Math.floor(m) + req.expires_in_minutes)} if you don't answer.` : "Asks pass after a little while.";
    const body = [
      el("div", { class: "row" }, avatar(from, w.nameOf(from), "mid"), el("p", { class: "grow" }, String(req.text || `${w.nameOf(from)} is asking: ${req.kind}`))),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn primary grow", onclick: () => answer(true) }, "Accept"),
        el("button", { type: "button", class: "btn grow", onclick: () => answer(false) }, "Decline")),
      el("p", { class: "hint" }, `${passes} Closed this by mistake? The Romance app on your phone lists the asks still waiting for you.`),
    ];
    this.announce(`Ask from ${w.nameOf(from)}`);
    this.openSheet("request", req.id, this.head(`An ask · ${titleCase(req.kind)}`, w.nameOf(from)), body, null, { focus: false });
  }

  // You: needs and feelings (lowest first, with numbers), today, and the game menu.
  sheetYou() {
    const s = this.world.self;
    if (!s) return;
    const bars = (obj, feelings) => el("div", { class: "bars" }, Object.entries(obj || {}).filter(([, v]) => typeof v === "number")
      .sort((a, b) => (feelings ? 0 : a[1] - b[1])).flatMap(([k, v]) => {
        const bad = feelings && BAD_FEELINGS.has(k), low = !feelings && v < 20;
        const cls = feelings ? (bad ? (v >= 50 ? "bad" : "") : v >= 50 ? "good" : "") : low ? "low" : "";
        return [el("span", null, titleCase(k)), el("div", { class: `bar ${cls}`, role: "img", "aria-label": `${titleCase(k)} ${Math.round(v)} of 100${low ? ", low" : ""}${feelings && bad && v >= 50 ? ", not good for you" : ""}` },
          el("span", { style: { width: `${Math.max(0, Math.min(100, v))}%` } })), el("span", { class: `money${low ? " lowtag" : ""}` }, String(Math.round(v)))];
      }));
    const next = this.nextItem;
    this.openSheet("needs", "needs", [el("span", { class: "you-big" }, avatar(this.world.selfId, this.world.selfName, "mid")), this.head("You", this.world.selfName)], [
      next ? el("button", { type: "button", class: "btn block", onclick: () => this.sheetToday() }, icon("today"), `Today · Next: ${next.title}`) : el("button", { type: "button", class: "btn block", onclick: () => this.sheetToday() }, icon("today"), "Today"),
      el("div", { class: "eyebrow" }, "Needs, lowest first"), bars(s.needs, false),
      el("p", { class: "hint" }, "Only you see these. Eat, sleep, wash and see people to keep them up; anything below 20 needs you soon."),
      el("div", { class: "eyebrow" }, "Feelings"), bars(s.emotions, true),
      el("p", { class: "hint" }, "Green is good for you, red is not: high stress or embarrassment hurts, high happiness helps."),
      ...(this.game.youExtras ? this.game.youExtras() : []),  // the street: wanted, held, walking away from fights (moments.js)
      el("div", { class: "eyebrow" }, "Game"),
      el("button", { type: "button", class: "btn block", id: "you-menu", onclick: () => this.sheetMenu() }, lotus(), "Game menu"),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn grow", onclick: () => { this.renderer.followMe(); this.closeSheet(); } }, icon("recenter"), "Follow me"),
        el("button", { type: "button", class: "btn grow", onclick: () => { this.renderer.fitTown(); this.closeSheet(); } }, icon("fit"), "Whole town")),
      el("p", { class: "hint" }, "Keys on a computer: Enter talks, G finds a place, P opens the phone, Y opens this card, Esc closes the top one."),
    ]);
  }
  sheetNeeds() { this.sheetYou(); }

  sheetToday() {
    const g = this.game;
    this.openSheet("today", "today", this.head("Today", "What's next"), [...g.firstMorning.list(), ...g.agenda.todayBody()]);
  }
  sheetPlaces(opts) { sheetPlaces(this, opts); }

  // The log: what you heard, and what happened (results, refusals, notes from the town).
  sheetLog(refresh = false) {
    const tab = this.logTab;
    const items = this.history.filter(h => h.cat === tab).slice(-100).reverse();
    const tabs = el("div", { class: "seg tabs", role: "tablist", "aria-label": "Log" }, [["speech", "Speech"], ["activity", "Activity"]].map(([k, l]) =>
      el("button", { type: "button", role: "tab", "aria-selected": String(k === tab), "aria-pressed": String(k === tab), onclick: () => { this.logTab = k; this.sheetLog(true); } }, l)));
    const list = items.length ? el("ul", { class: "list" }, items.map(h => el("li", null,
      el("div", { class: `line ${h.kind}` }, h.who ? el("b", null, h.who) : null, h.text))))
      : el("p", { class: "hint" }, tab === "speech" ? "Nothing yet. Speech you hear shows up here." : "Nothing yet. What you do, and what the town tells you, shows up here.");
    if (refresh && this.sheet && this.sheet.kind === "log") {
      const body = this.$("sheet").querySelector(".sheet-body");
      if (body) { replace(body, tabs, list); return; }
    }
    this.openSheet("log", "log", this.head("Log", "Heard and seen"), [tabs, list]);
  }

  sheetMenu() {
    const g = this.game;
    this.openSheet("menu", "menu", [el("div", { class: "sheet-mark" }, lotus()), this.head("Livéra", g.username ? `Signed in as ${g.username}` : "Menu")], [
      el("p", { class: "hint" }, `Playing ${this.world.selfName || "nobody yet"}.`),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.followMe(); this.closeSheet(); } }, "Follow me"),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.fitTown(); this.closeSheet(); } }, "See the whole town"),
      el("button", { type: "button", class: "btn block", onclick: () => this.sheetYou() }, "Needs and feelings"),
      el("button", { type: "button", class: "btn danger block", onclick: () => g.logout() }, "Log out"),
      el("div", { class: "eyebrow" }, "What this is"),
      el("p", { class: "hint" }, SKETCH_NOTICE + ". Door positions, names, prices, opening status, bus stops and everyone's movements come from the game itself; its rules decide every outcome."),
      el("p", { class: "hint" }, "Characters marked “played by a script” are the town's people (founders, residents, townspeople) a labelled script plays while no player has them. The bus is a single-rider shuttle until shared buses exist."),
      el("p", { class: "hint" }, `Server protocol: ${g.protocol || "unknown"}.`),
    ]);
  }

  // A control rings for a moment (the first-morning checklist's "Show me").
  ring(id) {
    const n = typeof id === "string" ? this.$(id) : id;
    if (!n) return;
    n.classList.remove("ring"); void n.offsetWidth; n.classList.add("ring");
    setTimeout(() => n.classList.remove("ring"), 3800);
  }

  // ------------------------------------------------------------------ full-screen screens
  showScreen(node) { const s = this.$("screen"); replace(s, node); s.hidden = false; s.scrollTop = 0; }
  hideScreen() { const s = this.$("screen"); s.hidden = true; clear(s); }
}

