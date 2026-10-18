// The in-game interface around the map: top bar (clock, weather, money, needs), the chat bar
// (whisper / say / shout), the feed of what you heard, and one bottom sheet at a time (a
// place, a person, a bus stop, the scene inside a building, an ask to answer).
//
// Every button is an intent sent to the server through `game`; the server decides and the
// sheet shows its answer or its refusal, word for word. Server text only reaches the page
// through el() (text nodes), never as HTML.

import { el, replace, clear, money, avatar, firstName, titleCase } from "./dom.js";
import { typeName, SKETCH_NOTICE } from "./layout.js";
import { stamp } from "./render2d.js";
import { dist } from "./state.js";

const ASKS = [
  { kind: "date", label: "Ask on a date" }, { kind: "kiss", label: "Ask for a kiss" }, { kind: "propose", label: "Propose" },
  { kind: "marry", label: "Ask to marry now" }, { kind: "intimacy", label: "Ask for intimacy" }, { kind: "move_in", label: "Invite to move in" },
];
const WX_LABEL = { sun: "sunny", cloud: "cloudy", rain: "rain", storm: "storm", snow: "snow" };

export class UI {
  constructor({ world, game, renderer }) {
    this.world = world; this.game = game; this.renderer = renderer;
    this.volume = "say"; this.whisperTo = null; this.targetsKey = ""; this.needsKey = "";
    this.sheet = null;   // {kind, id, update}
    this.history = [];
    this.$ = id => document.getElementById(id);
  }

  init() {
    const $ = this.$;
    $("sketch-note").textContent = SKETCH_NOTICE;
    $("z-in").onclick = () => this.renderer.zoomBy(1.3);
    $("z-out").onclick = () => this.renderer.zoomBy(1 / 1.3);
    $("z-fit").onclick = () => { this.renderer.fitTown(); this.syncFollow(); };
    $("z-me").onclick = () => { this.renderer.followMe(); this.syncFollow(); };
    $("phone-btn").onclick = () => this.game.openPhone();
    $("money").onclick = () => this.game.openPhone("bank");
    $("menu-btn").onclick = () => this.sheetMenu();
    $("clock").onclick = () => { const t = this.world.time; if (t) this.toast(`${t.text}${this.world.weather ? ` · ${this.weatherText()}` : ""}`); };
    $("log-btn").onclick = () => this.sheetLog();
    for (const b of document.querySelectorAll("#chatbar [data-volume]")) b.onclick = () => this.setVolume(b.dataset.volume);
    const input = $("chat-input");
    input.addEventListener("focus", () => { this.renderer.ringHold = this.volume; });
    input.addEventListener("blur", () => { this.renderer.ringHold = null; });
    $("chatbar").addEventListener("submit", e => { e.preventDefault(); this.sendChat(); });
    // Keep the feed and the sheet above the chat bar, whatever its height (whisper row, safe areas).
    const app = $("app");
    new ResizeObserver(() => app.style.setProperty("--chat-h", `${$("chatbar").offsetHeight}px`)).observe($("chatbar"));
    new ResizeObserver(() => app.style.setProperty("--sheet-h", `${$("sheet").hidden ? 0 : $("sheet").offsetHeight}px`)).observe($("sheet"));
    new ResizeObserver(() => app.style.setProperty("--hud-h", `${$("hud").offsetHeight + 4}px`)).observe($("hud"));
    this.setVolume("say", true);
  }

  // The part of the map not under the top bar, the chat bar or the sheet: the camera keeps you in it.
  insets() {
    const $ = this.$, narrow = window.innerWidth < 900;
    const top = $("hud").hidden ? 0 : $("hud").getBoundingClientRect().bottom;
    const chat = $("chatbar").hidden ? 0 : $("chatbar").offsetHeight;
    const sheet = $("sheet").hidden ? 0 : $("sheet").offsetHeight;
    return { top, bottom: narrow ? chat + sheet : 0 };
  }
  showGame(on) { for (const id of ["hud", "mapctl", "chatbar"]) this.$(id).hidden = !on; if (!on) this.closeSheet(true); }
  syncFollow() { const b = this.$("z-me"); b.classList.toggle("on", this.renderer.follow); b.setAttribute("aria-pressed", String(this.renderer.follow)); }
  setConnection(text) { const c = this.$("conn"); c.hidden = !text; c.textContent = text || ""; }

  // ------------------------------------------------------------------ top bar (called a few times a second)
  tick(now) {
    const w = this.world, $ = this.$;
    const m = w.minute(now);
    if (m !== null) {
      $("clock-time").textContent = stamp(m);
      const t = w.time, wx = w.weather;
      $("clock-sub").textContent = [t && t.day ? `Day ${t.day}` : "", wx ? this.weatherText() : ""].filter(Boolean).join(" · ");
    }
    if (w.money) { $("money-bank").textContent = money(w.money.bank_cents); $("money-cash").textContent = `cash ${money(w.money.cash_cents)}`; }
    else if (w.moneyError) { $("money-bank").textContent = "$—"; $("money-cash").textContent = w.moneyError; }
    this.renderNeeds();
    if (this.volume === "whisper") this.renderTargets();
    this.renderRangeNote();
    this.syncFollow();
    if (this.sheet && this.sheet.update) this.sheet.update(now);
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
  renderNeeds() {
    const s = this.world.self;
    if (!s || !s.needs) return;
    const low = Object.entries(s.needs).filter(([, v]) => typeof v === "number").sort((a, b) => a[1] - b[1]).slice(0, 3);
    const key = low.map(([k, v]) => `${k}${Math.round(v)}`).join();
    if (key === this.needsKey) return;
    this.needsKey = key;
    replace(this.$("needs"), low.map(([k, v]) => el("button", { type: "button", class: `need ${v < 30 ? "low" : v < 60 ? "mid" : ""}`, onclick: () => this.sheetNeeds(),
      "aria-label": `${titleCase(k)} ${Math.round(v)} of 100`, title: `${titleCase(k)} ${Math.round(v)}` }, el("span", { class: "pill" }, titleCase(k), el("span", { class: "meter" }, el("span", { style: { width: `${Math.max(0, Math.min(100, v))}%` } }))))));
  }

  // ------------------------------------------------------------------ feed and toasts
  line(who, text, kind = "say") {
    this.history.push({ who, text, kind, at: Date.now() });
    if (this.history.length > 200) this.history.shift();
    this.addFeed(el("div", { class: `line ${kind}`, dataset: { kind } }, who ? el("b", null, who) : null, text), kind === "say" || kind === "shout" || kind === "whisper" ? 14000 : 9000);
    if (this.sheet && this.sheet.kind === "log") this.sheetLog();
  }
  toast(text, bad = false) {
    this.addFeed(el("div", { class: `line toast${bad ? " bad" : ""}`, role: bad ? "alert" : "status" }, text), bad ? 6000 : 3500);
  }
  addFeed(node, ms) {
    const feed = this.$("feed");
    feed.appendChild(node);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => node.classList.add("fade"), ms);
    setTimeout(() => node.remove(), ms + 700);
  }
  refusal(r, what) { if (!r.ok) this.toast(what ? `${what}: ${r.error.message}` : r.error.message, true); return r.ok; }

  // ------------------------------------------------------------------ chat bar
  setVolume(v, quiet) {
    this.volume = v;
    for (const b of document.querySelectorAll("#chatbar [data-volume]")) b.setAttribute("aria-pressed", String(b.dataset.volume === v));
    this.$("whisper-targets").hidden = v !== "whisper";
    this.$("chat-input").placeholder = v === "whisper" ? "Whisper something" : v === "shout" ? "Shout something" : "Say something";
    if (v === "whisper") { this.targetsKey = ""; this.renderTargets(); } else this.whisperTo = null;
    this.renderRangeNote();
    if (!quiet) this.renderer.setRing(v);
    if (document.activeElement === this.$("chat-input")) this.renderer.ringHold = v;
  }
  // Whisper only offers people close enough to hear it (indoors: anyone in the building).
  renderTargets() {
    const w = this.world, inRange = w.peopleWithin(w.rules.whisper_range_m);
    if (this.whisperTo && !inRange.some(p => p.id === this.whisperTo)) this.whisperTo = null;
    if (!this.whisperTo && inRange.length === 1) this.whisperTo = inRange[0].id;
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
    this.setVolume("whisper");
    if (this.world.peopleWithin(this.world.rules.whisper_range_m).some(p => p.id === id)) { this.whisperTo = id; this.targetsKey = ""; this.renderTargets(); }
    else this.toast(`Walk right up to ${firstName(this.world.nameOf(id))} to whisper (${this.world.rules.whisper_range_m} m).`);
    this.$("chat-input").focus();
  }
  async sendChat() {
    const input = this.$("chat-input"), text = input.value.trim();
    if (!text) return;
    if (this.volume === "whisper" && !this.whisperTo) { this.toast("Pick who to whisper to.", true); return; }
    const to = this.volume === "whisper" ? this.whisperTo : undefined;
    const r = await this.game.say(text, this.volume, to);
    if (!r.ok) { this.toast(r.error.message, true); return; }
    input.value = "";
    this.history.push({ who: this.volume === "whisper" ? `You (to ${firstName(this.world.nameOf(to))})` : "You", text, kind: this.volume, at: Date.now() });
    const heard = Number(r.data.heard_by) || 0;
    this.toast(this.volume === "whisper" ? `Whispered to ${firstName(this.world.nameOf(to))}` : heard ? `Heard by ${heard}` : "Nobody heard you");
  }

  // ------------------------------------------------------------------ sheets
  openSheet(kind, id, head, body, update) {
    const sheet = this.$("sheet");
    const closeBtn = el("button", { type: "button", class: "iconbtn", "aria-label": "Close", onclick: () => this.closeSheet() }, "✕");
    replace(sheet, el("div", { class: "sheet-head" }, head, closeBtn), el("div", { class: "sheet-body" }, body));
    sheet.hidden = false; sheet.classList.remove("mini"); sheet.dataset.kind = kind; sheet.scrollTop = 0;
    document.getElementById("app").classList.add("sheet-open");
    this.sheet = { kind, id, update };
    this.renderer.select(kind === "place" || kind === "person" || kind === "stop" ? { kind, id } : null);
    if (update) update(performance.now());
  }
  // Inside a building, closing a sheet goes back to the scene pill, so Exit is always on screen.
  // `force` really hides it (leaving the game, or once you're outside).
  closeSheet(force = false) {
    const w = this.world;
    if (!force && w.self && w.self.inside && w.here) { this.miniScene(); return; }
    const sheet = this.$("sheet");
    sheet.hidden = true; clear(sheet); delete sheet.dataset.kind;
    this.sheet = null; this.renderer.select(null);
    const app = document.getElementById("app");
    app.style.setProperty("--sheet-h", "0px"); app.classList.remove("sheet-open");
  }
  head(eyebrow, title, extra) {
    return el("div", { class: "grow" }, eyebrow ? el("div", { class: "eyebrow" }, eyebrow) : null, el("h2", null, title), extra || null);
  }

  // A building or open space on the map (outside).
  sheetPlace(id) {
    const w = this.world, b = w.buildingById.get(id) || w.buildingOfPlace.get(id), pl = w.placeById.get(id);
    const target = b || (pl && { id: pl.id, name: pl.name, type: pl.type, district: pl.district, door: pl.door, status: pl.status, enterable: false });
    if (!target) return;
    const placeholder = target.type === "civic" && target.enterable === false;
    const status = target.status === "under_construction" ? ["building", "under construction"] : target.status === "closed" ? ["closed", "closed"] : ["open", "open"];
    const distText = el("p", { class: "hint" });
    const body = [];
    body.push(el("div", { class: "row" }, el("span", { class: `badge ${status[0]}` }, status[1]),
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
      body.push(el("div", { class: "eyebrow" }, "Homes in this building"));
      body.push(el("ul", { class: "list" }, target.units.map(u => el("li", null,
        el("div", { class: "offer-head" }, el("span", null, u.name), el("span", { class: "hint" }, typeName(u.type))),
        el("button", { type: "button", class: "btn small", onclick: () => this.game.goInside(u.id) }, "Go inside")))));
      body.push(el("p", { class: "hint" }, "Residents only: the server lets you into your own home, or a home you're invited into."));
    } else if (target.enterable) {
      body.push(el("button", { type: "button", class: "btn primary block", onclick: () => this.game.goInside(target.id) }, "Go inside"));
      body.push(el("p", { class: "hint" }, "You'll walk to the door, then step in."));
    }
    body.push(el("button", { type: "button", class: "btn block", onclick: () => this.game.walkTo(target.door) }, "Walk here"));
    this.openSheet("place", target.id, this.head(`${typeName(target.shape || target.type)}${target.district ? " · " + target.district : ""}`, target.name), body, now => {
      const me = w.selfPos(now);
      distText.textContent = !me ? "" : w.self.inside ? "You're inside somewhere: exit first." : `${Math.round(dist(me, target.door))} m from you`;
    });
  }

  // The scene inside a building: who's here, what's on sale, what you can do, work, exit.
  sheetScene() {
    const w = this.world, here = w.here;
    if (!here) return;
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
    if (here.description) body.push(el("p", { class: "desc" }, here.description));
    body.push(el("div", { class: "row" }, el("span", { class: `badge ${here.status === "open" ? "open" : "closed"}` }, String(here.status || "open").replace(/_/g, " ")),
      w.self.onShift ? el("span", { class: "badge open" }, "on shift") : null));
    body.push(el("div", { class: "eyebrow" }, "Here with you"), peopleBox);
    if (Array.isArray(here.offers) && here.offers.length) {
      body.push(el("div", { class: "eyebrow" }, "On sale"));
      body.push(el("ul", { class: "list" }, here.offers.map(o => el("li", null,
        el("div", { class: "offer-head" }, el("span", null, o.label), el("span", { class: "price" }, money(o.price_cents))),
        el("div", { class: "paybtns", role: "group", "aria-label": `Buy ${o.label}` },
          el("button", { type: "button", class: "btn small", dataset: { buy: o.id, method: "card" }, onclick: () => this.game.buy(o, "card") }, "Card"),
          el("button", { type: "button", class: "btn small", dataset: { buy: o.id, method: "cash" }, onclick: () => this.game.buy(o, "cash") }, "Cash"),
          el("button", { type: "button", class: "btn small", dataset: { buy: o.id, method: "phone" }, onclick: () => this.game.buy(o, "phone") }, "Phone"))))));
    }
    if (Array.isArray(here.activities) && here.activities.length) {
      body.push(el("div", { class: "eyebrow" }, "Things to do"));
      body.push(el("div", { class: "grid2" }, here.activities.map(a => el("button", { type: "button", class: "btn small", onclick: () => this.game.activity(a) }, a.label))));
    }
    const career = w.career, works = w.self.onShift || (career && Array.isArray(career.workplaces) && career.workplaces.includes(here.name));
    if (works) {
      body.push(el("div", { class: "eyebrow" }, `Work${career && career.title ? " · " + career.title : ""}`));
      body.push(el("div", { class: "row" },
        el("button", { type: "button", class: "btn", onclick: () => this.game.work("start") }, "Start shift"),
        el("button", { type: "button", class: "btn", onclick: () => this.game.work("end") }, "End shift")));
    }
    // Study where the server would allow it: at a campus of the program you're enrolled in (the
    // school app names programs and campuses, not ids). Not enrolled: the programs taught here.
    const school = w.school, programs = school && Array.isArray(school.programs) ? school.programs : [];
    const taughtHere = p => Array.isArray(p.campuses) && p.campuses.includes(here.name);
    const enrolled = school && school.enrolled, mine = enrolled && programs.find(p => p.name === enrolled.program);
    if (enrolled && ((mine && taughtHere(mine)) || enrolled.studying)) {
      body.push(el("div", { class: "eyebrow" }, "Study"));
      body.push(el("p", { class: "hint" }, `${enrolled.program}: ${enrolled.hours ?? 0} of ${enrolled.hours_required ?? "?"} hours${enrolled.studying ? " · studying now" : ""}`));
      body.push(el("div", { class: "row" },
        el("button", { type: "button", class: "btn", onclick: () => this.game.study("start") }, "Start studying"),
        el("button", { type: "button", class: "btn", onclick: () => this.game.study("end") }, "End studying")));
    } else if (!enrolled && programs.some(taughtHere)) {
      const open = programs.filter(p => taughtHere(p) && p.eligible && p.id);
      body.push(el("div", { class: "eyebrow" }, "Study here"));
      if (open.length) {
        body.push(el("ul", { class: "list" }, open.map(p => el("li", null,
          el("div", { class: "offer-head" }, el("span", null, p.name), el("span", { class: "price" }, `${money(p.tuition_per_hour_cents)}/hr`)),
          el("div", { class: "hint" }, `${p.hours_required} hours of study; tuition is paid per hour studied.`),
          el("button", { type: "button", class: "btn small", dataset: { enroll: p.id }, onclick: () => this.game.enroll(p) }, "Enroll")))));
      } else body.push(el("p", { class: "hint" }, "No program taught here is open to you (the school app says what each one needs)."));
    }
    body.push(el("button", { type: "button", class: "btn primary block", id: "exit-btn", onclick: () => this.game.exit() }, "Exit"));
    const head = this.head(typeName(here.type), here.name);
    this.openSheet("scene", here.id, head, body, () => updatePeople());
    // The scene card can shrink to a pill so the map shows.
    const sheet = this.$("sheet"), headNode = sheet.querySelector(".sheet-head");
    headNode.insertBefore(el("button", { type: "button", class: "iconbtn", "aria-label": "Shrink", onclick: () => this.miniScene() }, "▾"), headNode.lastChild);
  }
  miniScene() {
    const w = this.world, sheet = this.$("sheet");
    if (!w.here) return;
    replace(sheet, el("div", { class: "mini-pill" },
      el("button", { type: "button", class: "btn grow", onclick: () => this.sheetScene() }, `Inside: ${w.here.name} ▴`),
      el("button", { type: "button", class: "btn", onclick: () => this.game.exit() }, "Exit")));
    sheet.hidden = false; sheet.dataset.kind = "scene-mini";
    this.renderer.select(null);
    sheet.classList.add("mini");
    document.getElementById("app").classList.remove("sheet-open");
    this.sheet = { kind: "scene-mini", id: w.here.id };
  }

  personChip(p) {
    return el("button", { type: "button", class: "person", dataset: { person: p.id }, onclick: () => this.sheetPerson(p.id) },
      avatar(p.id, p.name), firstName(p.name), p.scripted ? el("span", { class: "badge script" }, "script") : null);
  }

  // Someone you can see: their face, what you can do with them, and asks.
  sheetPerson(id) {
    const w = this.world, p = w.people.get(id);
    if (!p) { this.toast("They're out of sight now."); return; }
    const distText = el("p", { class: "hint" });
    const body = [];
    body.push(el("div", { class: "row" }, avatar(id, p.name, "big"), el("div", { class: "stack grow" },
      p.scripted ? el("span", { class: "badge script" }, "played by a script") : null,
      el("span", { class: "hint" }, p.known ? "You've met." : "You haven't met yet."), distText)));
    if (p.scripted) body.push(el("p", { class: "hint" }, "A script chooses where this character goes and what they do; the server decides every outcome, as for everyone."));
    body.push(el("div", { class: "eyebrow" }, "Talk"));
    if (w.interactions && w.interactions.length) {
      body.push(el("div", { class: "grid2" }, w.interactions.map(i => el("button", {
        type: "button", class: "btn small", dataset: { interaction: i.id }, onclick: () => this.game.interact(i, id),
      }, i.label))));
      body.push(el("p", { class: "hint" }, "Too far? You'll walk over first."));
    } else body.push(el("p", { class: "notice" }, "This server doesn't publish its list of interactions yet (it arrives with the newer protocol)."));
    body.push(el("button", { type: "button", class: "btn block", onclick: () => { this.closeSheet(); this.whisperToPerson(id); } }, `Whisper to ${firstName(p.name)}`));

    // Money: a tip from your bank, or LivPay from your phone.
    const amount = el("input", { type: "number", inputmode: "decimal", min: "1", step: "1", class: "input", value: "5", "aria-label": "Dollars" });
    const note = el("input", { type: "text", class: "input", maxlength: "80", placeholder: "Note (LivPay, optional)", "aria-label": "Note" });
    const cents = () => Math.round(parseFloat(amount.value) * 100);
    body.push(el("div", { class: "eyebrow" }, "Money"));
    body.push(el("div", { class: "row" }, el("span", null, "$"), el("div", { class: "grow" }, amount)));
    body.push(note);
    body.push(el("div", { class: "row" },
      el("button", { type: "button", class: "btn grow", onclick: () => this.game.tip(id, cents()) }, "Tip"),
      el("button", { type: "button", class: "btn grow", onclick: () => this.game.livpay(id, cents(), note.value.trim()) }, "Send with LivPay")));

    // Give something you own.
    const giveBox = el("div", { class: "row" }, el("span", { class: "hint" }, "Loading your things…"));
    body.push(el("div", { class: "eyebrow" }, "Give"), giveBox);
    this.game.inventory().then(items => {
      if (!items) { replace(giveBox, el("span", { class: "hint" }, "Couldn't open your items.")); return; }
      if (!items.length) { replace(giveBox, el("span", { class: "hint" }, "You have nothing to give.")); return; }
      const sel = el("select", { class: "input grow", "aria-label": "Item" }, items.map(it => el("option", { value: it.id }, it.label)));
      replace(giveBox, el("div", { class: "grow" }, sel), el("button", { type: "button", class: "btn", onclick: () => this.game.give(id, sel.value) }, "Give"));
    });

    // Asks: the other player answers.
    const protection = el("input", { type: "checkbox", checked: true });
    body.push(el("div", { class: "eyebrow" }, "Ask"));
    body.push(el("div", { class: "grid2" }, ASKS.map(a => el("button", { type: "button", class: "btn small", onclick: () => this.game.ask(a.kind, id, a.kind === "intimacy" ? { protection: protection.checked } : {}) }, a.label))));
    body.push(el("label", { class: "choice" }, protection, "Use protection (intimacy)"));
    body.push(el("p", { class: "hint" }, "They answer yes or no. Adults-only and family rules are checked by the server when you ask and when they answer."));

    this.openSheet("person", id, this.head(p.known ? "Someone you know" : "Someone nearby", p.name), body, now => {
      if (!w.people.has(id)) { distText.textContent = "Out of sight now."; return; }
      const d = w.distanceTo(id, now);
      distText.textContent = d === 0 ? "Here with you." : isFinite(d) ? `${Math.round(d)} m away` : "";
    });
  }

  // A bus stop: pick where to go and how to pay.
  sheetStop(id) {
    const w = this.world, stop = w.stopById(id), line = stop && w.lineOfStop(id);
    if (!stop || !line) return;
    const body = [], distText = el("p", { class: "hint" });
    const hours = line.first_hour != null ? `${line.first_hour}:00–${line.last_hour}:00` : "";
    body.push(el("p", { class: "hint" }, `${line.name} · fare ${money(line.fare_cents)}${hours ? ` · runs ${hours}` : ""}`));
    body.push(distText);
    const dests = line.stops.filter(s => s.id !== stop.id);
    body.push(el("div", { class: "eyebrow" }, "Where to"));
    const destList = el("div", { class: "stack", role: "radiogroup", "aria-label": "Destination" }, dests.map((s, i) => el("label", { class: "choice" },
      el("input", { type: "radio", name: "dest", value: s.id, checked: i === 0 }), s.name)));
    body.push(destList);
    body.push(el("div", { class: "eyebrow" }, "Pay with"));
    let pay = "card";
    const payNote = el("p", { class: "hint" });
    const paySeg = el("div", { class: "seg", role: "group", "aria-label": "Pay with" }, [["card", "Card"], ["cash", "Cash"], ["phone", "LivPay"], ["dodge", "Dodge"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(k === pay), dataset: { pay: k }, onclick: e => {
        pay = k; for (const b of paySeg.children) b.setAttribute("aria-pressed", String(b.dataset.pay === k));
        payNote.textContent = k === "dodge" ? "Riding without paying: an inspector may catch you and fine you." : "";
      } }, label)));
    body.push(paySeg, payNote);
    body.push(el("button", { type: "button", class: "btn primary block", onclick: () => {
      const to = destList.querySelector("input:checked")?.value;
      if (!to) { this.toast("Pick a stop.", true); return; }
      this.game.rideFrom(stop, to, pay !== "dodge", pay === "dodge" ? "card" : pay);
    } }, "Ride"));
    body.push(el("p", { class: "hint" }, "Riders travel on a single-rider shuttle for now; shared buses on a timetable come later."));
    this.openSheet("stop", id, this.head(`Bus stop · ${line.name}`, stop.name), body, now => {
      const me = w.selfPos(now);
      if (!me) return;
      const d = dist(me, stop.at);
      distText.textContent = w.self.inside ? "Exit the building first." : d <= w.rules.boarding_radius_m ? "You're at this stop." : `${Math.round(d)} m away: you'll walk here first.`;
    });
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
    this.openSheet("request", req.id, this.head(`An ask · ${titleCase(req.kind)}`, w.nameOf(from)), body);
  }

  sheetNeeds() {
    const s = this.world.self;
    if (!s) return;
    const bars = obj => el("div", { class: "bars" }, Object.entries(obj || {}).flatMap(([k, v]) => [
      el("span", null, titleCase(k)), el("div", { class: `bar ${v < 30 ? "low" : ""}` }, el("span", { style: { width: `${Math.max(0, Math.min(100, v))}%` } })), el("span", { class: "money" }, String(Math.round(v)))]));
    this.openSheet("needs", "needs", this.head("You", this.world.selfName), [
      el("div", { class: "eyebrow" }, "Needs"), bars(s.needs), el("div", { class: "eyebrow" }, "Feelings"), bars(s.emotions),
      el("p", { class: "hint" }, "Only you see these. Eat, sleep, wash and see people to keep them up."),
    ]);
  }

  sheetLog() {
    const items = this.history.slice(-80);
    this.openSheet("log", "log", this.head("Heard and seen", "Recent"), items.length ? el("ul", { class: "list" }, items.map(h => el("li", null,
      el("div", { class: `line ${h.kind}` }, h.who ? el("b", null, h.who) : null, h.text)))) : el("p", { class: "hint" }, "Nothing yet. Speech you hear shows up here."));
  }

  sheetMenu() {
    const g = this.game;
    this.openSheet("menu", "menu", this.head("Livéra", g.username ? `Signed in as ${g.username}` : "Menu"), [
      el("p", { class: "hint" }, `Playing ${this.world.selfName || "nobody yet"}.`),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.followMe(); this.closeSheet(); } }, "Follow me"),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.fitTown(); this.closeSheet(); } }, "See the whole town"),
      el("button", { type: "button", class: "btn block", onclick: () => this.sheetNeeds() }, "Needs and feelings"),
      el("button", { type: "button", class: "btn danger block", onclick: () => g.logout() }, "Log out"),
      el("div", { class: "eyebrow" }, "What this is"),
      el("p", { class: "hint" }, SKETCH_NOTICE + ". Door positions, names, prices, opening status, bus stops and everyone's movements come from the game server; the server decides every outcome."),
      el("p", { class: "hint" }, "Characters marked “played by a script” are founding residents a labelled script plays while no player has them. The bus is a single-rider shuttle until shared buses exist."),
      el("p", { class: "hint" }, `Server protocol: ${g.protocol || "unknown"}.`),
    ]);
  }

  // ------------------------------------------------------------------ full-screen screens
  showScreen(node) { const s = this.$("screen"); replace(s, node); s.hidden = false; s.scrollTop = 0; }
  hideScreen() { const s = this.$("screen"); s.hidden = true; clear(s); }
}
