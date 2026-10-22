// Moments: the BitLife pillar and the street (D-068, D-069, D-070). A life event the server sends
// (`life_event`) slides up as a card: the prompt, the choices as big buttons (what a choice is sure to
// cost is on it), then what happened and what changed ("−$40 · Happiness +6 · Maya: grateful").
// "Later" shrinks it to a pill and leaves it in the phone's Story app until it lapses; walking off
// does the same, so a moment never holds you still. The street: a crime's risk and its consequence
// ladder before you commit (confirmCrime, from the server's `crime_risk`), the Wanted and Held chips,
// the arrest and the cell, a fight card when someone swings at you, a result card, the scuffle on
// the map and the badge on an officer in uniform. Every outcome is the server's reply as it came.
//
//   installMoments(game) -> api      (main.js, once; api.onEvent(msg) returns true when it took one)
//   confirmCrime(game, opts) -> Promise<{go, choice}>   (verbs.js, before a crime)
//   storyScreen.call(phone, data)    (phone.js: the Story app)
//
// Server text reaches the page only through el() (text nodes).

import { el, replace, money, firstName, titleCase, avatar } from "./dom.js";
import { icon } from "./icons.js";
import { BrawlScreen } from "./brawl.js";

(function addStylesheet() {
  if (typeof document === "undefined" || document.querySelector("link[data-moments-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./css/moments.css", import.meta.url).href;
  link.dataset.momentsCss = "";
  document.head.appendChild(link);
})();

const pad = n => String(n).padStart(2, "0");
const hhmm = minute => { const m = Math.max(0, Math.floor(Number(minute) || 0)) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const span = minutes => { const n = Math.max(0, Math.round(Number(minutes) || 0)), h = Math.floor(n / 60), m = n % 60; return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`; };
const sentence = t => { const s = String(t ?? "").trim(); return s && !/[.!?…"”]$/.test(s) ? s + "." : s; };
const signed = n => `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;
// How long a game hour takes in real time at the world's rate ("half a real minute" at 2 game minutes a second).
const realHour = rules => {
  const s = 60 / ((rules && rules.minutes_per_real_second) || 1);
  return s === 60 ? "a real minute" : s === 30 ? "half a real minute" : s < 60 ? `${Math.round(s)} real seconds` : `${Math.round(s / 60)} real minutes`;
};
const CATEGORY = { work: "At work", money: "Money", love: "Love", friends: "Friends", family: "Family", health: "Health", town: "The town", temptation: "Temptation", street: "The street" };
const pct = p => (p >= 0.995 ? "almost certain" : `${Math.max(1, Math.round(p * 100))}%`);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
// What a choice costs, as the server says: a sure price, or the most it can cost.
const costText = c => `${c.cost_sure === false ? "up to " : ""}${money(c.cost_cents)}${c.pay_with === "cash" ? " cash" : ""}`;

// "−$40 · Hunger +10 · Happiness +6 · Maya: grateful · A black eye"
export function changesText(c) {
  if (!c || typeof c !== "object") return "";
  const parts = [];
  if (typeof c.money_cents === "number") parts.push(`${c.money_cents < 0 ? "−" : "+"}${money(Math.abs(c.money_cents))}${c.account === "cash" ? " cash" : ""}`);
  for (const key of ["needs", "emotions"]) {
    for (const [k, v] of Object.entries(c[key] || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)) if (Math.round(v)) parts.push(`${titleCase(k)} ${signed(v)}`);
  }
  if (c.relationship) {
    const who = firstName(c.relationship.name || "");
    if (c.relationship.reaction) parts.push(`${who}: ${c.relationship.reaction}`);
    for (const [k, v] of Object.entries(c.relationship.your_feelings || {}).slice(0, 2)) if (Math.round(v)) parts.push(`your ${k.replace(/_/g, " ")} ${signed(v)}`);
  }
  if (typeof c.fame === "number" && c.fame) parts.push(`Fame ${c.fame > 0 ? "+" : "−"}${Math.abs(c.fame)}`);
  for (const i of c.injuries || []) parts.push(String(i));
  if (c.money_note) parts.push(String(c.money_note));
  return parts.join(" · ");
}

// ------------------------------------------------------------------ the crime check, before you commit

// What a crime risks, in words, from the server's crime_risk reply. Odds only where the server gives
// them (they're computed from who can see you); otherwise "risky", never a made-up number.
export function riskLines(r) {
  const lines = [];
  if (!r) return { odds: "Risky. The odds aren't something you can see from here.", ladder: [] };
  const seen = r.seen_by || {};
  const who = [seen.witnesses ? (r.crime === "pickpocketing" ? `${plural(seen.witnesses, "pair")} of eyes, theirs included` : plural(seen.witnesses, "person", "people") + " who could see") : "", seen.staff ? plural(seen.staff, "member") + " of staff on shift" : "",
    seen.police ? plural(seen.police, "officer") + " on duty nearby" : ""].filter(Boolean);
  const targeted = r.crime === "assault" || r.crime === "pickpocketing";
  const odds = typeof r.chance === "number"
    ? `${pct(r.chance)} chance of being caught right now${r.crime === "fare_evasion" ? `: inspectors check ${pct(r.chance)} of rides${r.line ? ` on ${r.line}` : ""}` : who.length ? ` (${who.join(", ")})` : targeted ? " (nobody else around)" : " (nobody's watching)"}.`
    : `Risky. ${r.note ? sentence(r.note) : "The odds show once you're there."}`;
  const c = r.if_caught || {};
  const court = c.court && typeof c.court === "object" ? c.court : null;  // a crime the court tries (D-083)
  if (court) {
    lines.push(`Held ${span(c.booking_minutes)} at ${c.held_at || "the police station"}, then charged, with a hearing at ${court.courthouse || "the courthouse"}`);
    if (typeof court.odds_if_caught === "number") lines.push(`In court, ${pct(court.odds_if_caught)} you're convicted if you plead not guilty, with who's here now`);
    if (court.if_convicted) lines.push(`Convicted: ${court.if_convicted.text}${court.if_guilty_plea ? `; plead guilty and it's ${court.if_guilty_plea.text}` : ""}`);
    if (c.record) lines.push(`${r.label || "It"} on your record if you're convicted`);
  } else {
    if (c.jail_minutes) lines.push(`Held ${span(c.jail_minutes)} at ${c.held_at || "the police station"}`);
    if (c.fine_cents) lines.push(`A ${money(c.fine_cents)} fine${c.jail_if_unpaid_minutes ? `; if you can't pay it, held ${span(c.jail_if_unpaid_minutes)} instead` : ""}`);
    if (c.record) lines.push(`${r.label || "It"} on your record`);
  }
  if (c.notoriety) lines.push("People hear about it");
  if (r.crime !== "fare_evasion" && c.seized) { const t = sentence(c.seized).replace(/\.$/, ""); lines.push(t[0].toUpperCase() + t.slice(1)); }
  // What can follow even when nobody stops you: reported, you're summoned to court (or, with no court, wanted).
  const after = [];
  const reported = court ? `you're summoned to court${typeof court.odds_if_reported === "number" ? ` (${pct(court.odds_if_reported)} you're convicted on a not-guilty plea)` : ""}` : "you're wanted";
  if (typeof r.notice_chance === "number") after.push(`${pct(r.notice_chance)} chance they notice, report you, and ${reported}`);
  if (typeof r.report_chance === "number") after.push(`${pct(r.report_chance)} chance they report you, and ${reported}${typeof r.witness_report_chance === "number" ? ` (more likely with anyone else watching)` : ""}`);
  for (const p of r.possession || []) after.push(`Carrying ${p.item}: ${p.crime}, ${money(p.fine_cents)}${p.jail_minutes ? ` and ${span(p.jail_minutes)}` : ""} if you're ever arrested with it`);
  if (Array.isArray(r.injuries) && r.injuries.length) after.push(`Either of you can come away with ${r.injuries.join(", ").toLowerCase()}`);
  return { odds, ladder: lines, after, extra: r.self_defence || null };
}

// The card before a crime: the odds, the ladder, then Do it (danger) or Back. `choices` (optional):
// [{id, label, detail}] to pick from first (what to take). Resolves {go: bool, choice}.
export function confirmCrime(game, { title, eyebrow = "Street", risk, choices = null, go = "Do it", note = null } = {}) {
  const m = moments(game);
  return new Promise(resolve => {
    let picked = choices && choices.length ? choices[0].id : null;
    const { odds, ladder, after, extra } = riskLines(risk);
    const done = value => { m.closeLayer("confirm"); resolve(value); };
    const list = choices && choices.length ? el("div", { class: "mo-picks", role: "radiogroup", "aria-label": "What" }, choices.map((c, i) =>
      el("label", { class: "mo-pick" }, el("input", { type: "radio", name: "mo-pick", value: c.id, checked: i === 0, onchange: () => { picked = c.id; } }),
        el("span", { class: "grow" }, c.label, c.detail ? el("span", { class: "mo-sub" }, c.detail) : null)))) : null;
    const card = el("section", { class: "mo-card mo-danger", role: "dialog", "aria-modal": "false", "aria-label": title, dataset: { moment: "confirm" } },
      el("div", { class: "mo-eyebrow" }, icon("alert"), eyebrow),
      el("h2", { class: "mo-title" }, title),
      el("p", { class: "mo-odds" }, odds),
      ladder.length ? el("div", { class: "mo-ladder" }, el("div", { class: "mo-label" }, "If you're caught"), el("ol", null, ladder.map(t => el("li", null, t)))) : null,
      after && after.length ? el("div", { class: "mo-ladder" }, el("div", { class: "mo-label" }, "Even if nobody stops you"), el("ul", null, after.map(t => el("li", null, t)))) : null,
      extra ? el("p", { class: "mo-sub" }, extra) : null,
      note ? el("p", { class: "mo-sub" }, note) : null,
      list,
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn danger mo-big", dataset: { crime: "go" }, onclick: () => done({ go: true, choice: picked }) }, go),
        el("button", { type: "button", class: "btn mo-big", onclick: () => done({ go: false }) }, "Back")));
    m.showLayer("confirm", card);
  });
}

// ------------------------------------------------------------------ the module

const instances = new WeakMap();
function moments(game) {
  let m = instances.get(game);
  if (!m) { m = new Moments(game); instances.set(game, m); }
  return m;
}
export function installMoments(game) { return moments(game); }

class Moments {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.layer = el("div", { id: "moments", class: "mo-layer" });
    this.pill = el("div", { id: "moment-pill", class: "mo-pill-wrap", hidden: true });
    this.chips = el("div", { id: "street-chips", class: "mo-chips", role: "group", "aria-label": "With the police", hidden: true });
    this.badges = el("div", { class: "mo-badges", "aria-hidden": "true" });
    const app = document.getElementById("app");
    app.appendChild(this.badges); app.appendChild(this.layer); app.appendChild(this.pill);
    const needs = document.getElementById("needs");
    if (needs && needs.parentNode) needs.parentNode.insertBefore(this.chips, needs.nextSibling);
    this.cards = new Map();   // kind -> node, top-most last
    this.offer = null;        // the life event on screen (or in the pill)
    this.queue = [];          // more that came up
    this.answered = new Set();
    this.fight = null;        // {fight, from, name, until}
    this.brawl = null;        // the Beat Brawl screen while a fight is fought (brawl.js)
    this.jail = null;         // {until, at} while held
    this.out = null;          // {until} while out cold (D-080)
    this.ward = null;         // {until, need} while kept in the hospital (D-080)
    this.wanted = null;
    this.court = null;        // look.you.court: your case, its date, a hearing open, service owed (D-083)
    this.courtCase = null;    // the case as the court app last showed it (the courtroom card's numbers)
    this.walkAway = null;
    this.lastStory = 0; this.lastRecord = 0; this.shownAt = 0;
    this.decorate();
    this.loop = () => { try { this.frame(); } catch (e) { console.warn("moments frame", e); } requestAnimationFrame(this.loop); };
    requestAnimationFrame(this.loop);
    setInterval(() => this.tick(), 500);
    if (typeof window !== "undefined" && !window.__liveraMoments) {
      window.__liveraMoments = Object.freeze({
        offer: () => (this.offer ? { event: this.offer.event, title: this.offer.title } : null),
        card: () => [...this.cards.keys()],
        wanted: () => this.wanted, jail: () => this.jail, out: () => this.out, ward: () => this.ward, court: () => this.court,
        courtApp: () => this.game.req("phone", { app: "court" }), record: () => this.game.req("phone", { app: "record" }),
        // Read-only phone apps, for the tests' arithmetic (the same op the money chip and the Story app use).
        bank: () => this.game.req("phone", { app: "bank" }), story: () => this.game.req("phone", { app: "story" }),
      });
    }
  }

  // The world model keeps what the client always drew; these fields are new: an officer's uniform
  // (people) and your own standing with the police (look.you). Read from the same messages.
  decorate() {
    const w = this.world, self = this;
    const applyLook = w.applyLook.bind(w), applyPeople = w.applyPeople.bind(w);
    w.applyLook = (look, now) => {
      applyLook(look, now);
      if (look && Array.isArray(look.people)) for (const p of look.people) { const e = w.people.get(p.id); if (e) { e.uniform = p.uniform || null; e.passedOut = !!p.passed_out; } }
      if (look && look.you && typeof look.you === "object") self.standing(look.you);
    };
    w.applyPeople = (changes, now) => {
      applyPeople(changes, now);
      for (const c of Array.isArray(changes) ? changes : []) {
        const e = c && w.people.get(c.character);
        if (e && c.state !== "gone") { e.uniform = c.uniform || null; e.passedOut = !!c.passed_out; }
      }
    };
  }

  standing(you) {
    const wanted = typeof you.wanted_for === "string" ? you.wanted_for : null;
    const until = Number.isFinite(you.jailed_until) ? you.jailed_until : null;
    if (wanted !== this.wanted) { this.wanted = wanted; this.renderChips(); }
    const was = this.jail;
    if (until && (!was || was.until !== until)) { this.jail = { until }; this.renderChips(); this.showJail(); }
    if (!until && was) { this.jail = null; this.renderChips(); this.showFree(); }
    // A need run down to 0 (D-080): out cold where you fell, or kept in the hospital.
    const out = Number.isFinite(you.passed_out_until) ? you.passed_out_until : null;
    if (out && (!this.out || this.out.until !== out)) { this.out = { until: out }; this.renderChips(); this.showOut(); this.game.refreshBank(); }
    if (!out && this.out) { this.out = null; this.renderChips(); this.closeLayer("out"); }
    const ward = Number.isFinite(you.admitted_until) ? you.admitted_until : null;
    if (ward && (!this.ward || this.ward.until !== ward)) { this.ward = { until: ward, need: you.admitted_for || "" }; this.renderChips(); this.showWard(); this.game.refreshBank(); }
    if (!ward && this.ward) { this.ward = null; this.renderChips(); this.showDischarged(); }
    // Your case (D-083): its date, the hearing open, community service owed. The Today card reads it from the world.
    const court = you.court && typeof you.court === "object" ? you.court : null;
    const was2 = this.court;
    if (JSON.stringify(court) !== JSON.stringify(was2)) {
      this.court = court; this.world.court = court; this.renderChips();
      // The hearing opened while the card wasn't up (a reload, a missed event): bring the courtroom up.
      if (court && court.status === "hearing" && (!was2 || was2.status !== "hearing") && !this.cards.has("courtroom")) this.openCourtroom(court.case);
    }
  }

  // ------------------------------------------------------------ layers (one card per kind; the newest on top)
  showLayer(kind, node) {
    this.closeLayer(kind);
    node.classList.add("mo-in");
    this.cards.set(kind, node);
    this.layer.appendChild(node);
    this.layer.classList.add("has");
    const first = node.querySelector("button");
    if (first && kind !== "life") setTimeout(() => { if (node.isConnected) first.focus({ preventScroll: true }); }, 60);
  }
  closeLayer(kind) {
    const n = this.cards.get(kind);
    if (n) n.remove();
    this.cards.delete(kind);
    this.layer.classList.toggle("has", this.cards.size > 0);
  }

  // ------------------------------------------------------------ events
  onEvent(msg) {
    const d = msg && msg.data && typeof msg.data === "object" ? msg.data : {};
    switch (msg && msg.event) {
      case "life_event": this.arrive(d); return true;
      case "life_event_lapsed": this.lapsed(d.event); return true;
      case "fight_started": this.fightStarted(d); return true;
      case "fight_result": this.fightResult(d); return true;
      case "fight": this.scuffle(d); return true;
      case "brawl": this.brawlStart(d); return true;
      case "brawl_beat": if (this.brawl) this.brawl.beat(d); return true;
      case "brawl_hit": if (this.brawl) this.brawl.hit(d); return true;
      // The court (D-083): your summons, your hearing, the verdict; a lawyer's brief; what the courtroom sees.
      case "court_summons": this.showSummons(d); this.lookSoon(); if (this.game.agenda) this.game.agenda.refresh("calendar"); return true;
      case "court_hearing": this.showCourtroom(d); this.lookSoon(); return true;
      case "court_verdict": this.showVerdict(d); this.lookSoon(); this.game.refreshBank(); return true;
      case "court_brief": this.showBrief(d); return true;
      case "court_lawyer": this.lawyerAnswered(d); return true;
      case "court_service": this.game.ui.toast("Community service done.", false, { ms: 3500 }); this.lookSoon(); return true;
      case "court": this.courtroomLine(d); return true;
      case "incident":
        if (d.character === this.world.selfId && d.kind === "arrest") { this.game.lastLook = 0; this.game.refreshLook(); }
        return false;   // the feed still says it
      case "notification":
        if (d.kind === "police") { this.game.lastLook = 0; setTimeout(() => this.game.refreshLook(), 50); }
        return false;
      default: return false;
    }
  }

  entered() {
    this.answered.clear();
    this.refreshStory(true);
    this.refreshRecord();
  }
  reset() {
    for (const k of [...this.cards.keys()]) this.closeLayer(k);
    if (this.brawl) { this.brawl.close(); this.brawl = null; }
    this.offer = null; this.queue = []; this.pill.hidden = true; this.fight = null; this.jail = null; this.out = null; this.ward = null; this.wanted = null;
    this.court = null; this.courtCase = null; this.world.court = null; this.renderChips();
  }
  lookSoon() { this.game.lastLook = 0; setTimeout(() => this.game.refreshLook(), 50); }

  async refreshStory(quiet) {
    this.lastStory = performance.now();
    const r = await this.game.req("phone", { app: "story" });
    if (!r.ok || !Array.isArray(r.data.pending)) return;
    for (const p of r.data.pending) if (!this.answered.has(this.key(p)) && (!this.offer || this.offer.event !== p.event) && !this.queue.some(q => q.event === p.event)) this.queue.push(p);
    if (!this.offer && this.queue.length) { this.offer = this.queue.shift(); quiet ? this.minimize() : this.showOffer(); }
  }
  async refreshRecord() {
    this.lastRecord = performance.now();
    const r = await this.game.req("phone", { app: "record" });
    if (!r.ok) return;
    if (typeof r.data.walk_away_from_fights === "boolean") this.walkAway = r.data.walk_away_from_fights;
    this.wanted = r.data.wanted ? (r.data.wanted_for || "a crime") : null;
    this.renderChips();
  }
  key(o) { return `${o.event}@${o.at}`; }

  tick() {
    const g = this.game;
    if (g.phase !== "playing" || !this.world.self) { if (this.cards.size || !this.pill.hidden || !this.chips.hidden) this.reset(); return; }
    const now = performance.now(), m = this.world.minute(now);
    // A waiting moment never holds you still: walk off and it waits in the pill.
    if (this.cards.has("life") && this.offer && !this.offer.result && this.world.self.target && now - this.shownAt > 2500) this.minimize();
    if (this.offer && m !== null && this.offer.lapses_at && m > this.offer.lapses_at + 1) this.lapsed(this.offer.event);
    if (now - this.lastStory > 45000) this.refreshStory(true);
    if (this.fight && this.cards.has("fight")) this.fightCountdown(now);
    if (this.jail && this.cards.has("jail")) this.jailCountdown();
    if (this.jail && m !== null && m > this.jail.until + 2 && now - (this.jailPoll || 0) > 3000) { this.jailPoll = now; g.lastLook = 0; g.refreshLook(); }
    if (this.out || this.ward) this.outCountdown();
    if (this.cards.has("courtroom")) this.courtCountdown();
    const over = (this.out && m !== null && m > this.out.until + 1) || (this.ward && m !== null && m > this.ward.until + 1);
    if (over && now - (this.outPoll || 0) > 3000) { this.outPoll = now; g.lastLook = 0; g.refreshLook(); }
  }

  // ------------------------------------------------------------ life events
  arrive(d) {
    if (!d || !d.event || this.answered.has(this.key(d))) return;
    if (this.offer && !this.offer.result) { if (this.offer.event !== d.event) this.queue.push(d); return; }
    this.offer = d;
    // Not over a fight or a cell: it waits in the pill.
    if (["fight", "jail", "confirm", "out", "ward", "courtroom", "summons", "verdict"].some(k => this.cards.has(k))) this.minimize(); else this.showOffer();
  }
  lapsed(event) {
    if (this.offer && this.offer.event === event && !this.offer.result) {
      this.closeLayer("life"); this.pill.hidden = true;
      this.game.ui.toast(`The moment passed: ${this.offer.title}.`, false, { ms: 3500 });
      this.offer = null;
      this.next();
    }
    this.queue = this.queue.filter(q => q.event !== event);
  }
  next() { if (!this.offer && this.queue.length) { this.offer = this.queue.shift(); this.minimize(); } }

  showOffer() {
    const o = this.offer;
    if (!o) return;
    this.pill.hidden = true;
    const choices = el("div", { class: "mo-choices" }, (o.choices || []).map(c => el("button", {
      type: "button", class: "btn mo-choice", dataset: { option: String(c.option) }, onclick: e => this.answer(c, e.currentTarget),
    }, el("span", { class: "grow" }, c.label), typeof c.cost_cents === "number" ? el("span", { class: "mo-cost" }, costText(c)) : null)));
    const m = this.world.minute();
    const card = el("section", { class: `mo-card mo-life${o.category === "street" || o.category === "temptation" ? " mo-street" : ""}`, role: "dialog", "aria-modal": "false", "aria-labelledby": "mo-life-title", dataset: { moment: o.event } },
      el("div", { class: "mo-head" },
        el("div", { class: "mo-eyebrow" }, CATEGORY[o.category] || "A moment", o.place ? ` · ${o.place}` : ""),
        el("button", { type: "button", class: "iconbtn mo-later-x", "aria-label": "Later: keep it in your phone", onclick: () => this.minimize() }, icon("down"))),
      o.with ? el("div", { class: "mo-with" }, avatar(o.with.id, o.with.name, "mid"), el("span", null, o.with.name)) : null,
      el("h2", { class: "mo-title", id: "mo-life-title" }, o.title),
      el("p", { class: "mo-prompt" }, o.prompt),
      choices,
      el("div", { class: "mo-foot" },
        el("button", { type: "button", class: "btn link", onclick: () => this.minimize() }, "Later"),
        el("span", { class: "mo-sub" }, o.lapses_at && m !== null ? `Passes at ${hhmm(o.lapses_at)} if you don't choose. It waits in your phone's Story app.` : "It waits in your phone's Story app.")));
    this.shownAt = performance.now();
    this.showLayer("life", card);
    this.game.ui.announce(`A moment: ${o.title}`);
  }
  minimize() {
    const o = this.offer;
    this.closeLayer("life");
    if (!o) { this.pill.hidden = true; return; }
    if (o.result) { this.offer = null; this.pill.hidden = true; this.next(); return; }
    replace(this.pill, el("button", { type: "button", class: "mo-pill", dataset: { moment: o.event }, "aria-label": `A moment: ${o.title}. Open it`, onclick: () => this.showOffer() },
      el("span", { class: "mo-dot", "aria-hidden": "true" }), el("span", { class: "mo-pill-text" }, o.title), el("span", { class: "mo-pill-cta" }, "Open")));
    this.pill.hidden = false;
  }

  async answer(choice, btn) {
    const o = this.offer;
    if (!o || o.busy) return;
    o.busy = true;
    for (const b of btn.parentNode.querySelectorAll("button")) b.disabled = true;
    const r = await this.game.req("event_answer", { event: o.event, option: choice.option });
    o.busy = false;
    if (!r.ok) {
      for (const b of btn.parentNode.querySelectorAll("button")) b.disabled = false;
      if (r.error.code === "unknown_event") { this.game.ui.toast("That moment has passed.", true); this.closeLayer("life"); this.offer = null; this.next(); return; }
      this.game.ui.refusal(r, choice.label);
      return;
    }
    this.answered.add(this.key(o));
    o.result = r.data;
    this.showOutcome(o, r.data);
    this.afterChange(r.data.changes);
  }
  showOutcome(o, d) {
    const fx = changesText(d.changes);
    const card = el("section", { class: "mo-card mo-life mo-done", role: "dialog", "aria-modal": "false", "aria-label": `${o.title}: what happened`, dataset: { moment: o.event, answered: "1" } },
      el("div", { class: "mo-eyebrow" }, CATEGORY[o.category] || "A moment", " · You chose"),
      el("h2", { class: "mo-title" }, d.label || o.title),
      el("p", { class: "mo-outcome" }, d.outcome),
      fx ? el("p", { class: "mo-fx", dataset: { fx: "1" } }, fx) : null,
      d.changes && d.changes.memory ? el("p", { class: "mo-sub" }, icon("check"), " Added to your story") : null,
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => { this.closeLayer("life"); this.offer = null; this.next(); } }, "Done"),
        el("button", { type: "button", class: "btn mo-big", onclick: () => { this.closeLayer("life"); this.offer = null; this.game.openPhone("story"); this.next(); } }, "Your story")));
    this.showLayer("life", card);
    const h = this.game.ui.history;
    h.push({ who: "", text: `${o.title}: ${d.label}. ${d.outcome}${fx ? ` (${fx})` : ""}`, kind: "result", cat: "activity", at: Date.now() });
    this.game.ui.announce(d.outcome);
  }
  afterChange(c) {
    const g = this.game;
    if (c && (typeof c.money_cents === "number")) g.refreshBank();
    g.lastLook = 0;
    if (c && c.relationship && c.relationship.with) { const p = this.world.people.get(c.relationship.with); if (p && g.renderer) g.renderer.addFloater({ who: c.relationship.with, text: c.relationship.reaction || "…" }); }
  }

  // ------------------------------------------------------------ fights
  fightStarted(d) {
    if (!d || !d.fight) return;
    const mprs = (this.world.rules && this.world.rules.minutes_per_real_second) || 1;
    this.fight = { ...d, until: performance.now() + (Number(d.expires_in_minutes) || 10) / mprs * 1000 };
    const who = firstName(d.name || this.world.nameOf(d.from));
    const bar = el("div", { class: "mo-timer", role: "timer" }, el("span", null));
    const card = el("section", { class: "mo-card mo-fight", role: "alertdialog", "aria-modal": "false", "aria-label": `${who} is attacking you`, dataset: { moment: "fight" } },
      el("div", { class: "mo-eyebrow" }, icon("alert"), "A fight"),
      el("div", { class: "mo-with" }, avatar(d.from, d.name, "mid"), el("span", null, d.name || who)),
      el("h2", { class: "mo-title" }, `${who} squares up to you.`),
      bar,
      el("div", { class: "mo-choices" }, (d.choices || []).map(c => el("button", {
        type: "button", class: `btn mo-choice${c.choice === "fight_back" ? " mo-hot" : ""}`, dataset: { fight: c.choice }, onclick: e => this.respond(c.choice, e.currentTarget),
      }, el("span", { class: "grow" }, c.label), el("span", { class: "mo-sub" }, c.choice === "fight_back" ? "self-defence" : c.choice === "run" ? "if you get away, nothing lands" : "you won't hit back")))),
      el("p", { class: "mo-sub" }, d.note || "Do nothing and you freeze: you take it."),
      el("p", { class: "mo-sub" }, "Never want this? In the You card: always walk away from fights."));
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("fight", card);
    this.fightCountdown(performance.now());
    this.game.ui.announce(`${who} is attacking you. Fight back, run, or take it.`);
  }
  fightCountdown(now) {
    const f = this.fight, card = this.cards.get("fight");
    if (!f || !card) return;
    const left = Math.max(0, f.until - now), total = Math.max(1, (Number(f.expires_in_minutes) || 10) / ((this.world.rules && this.world.rules.minutes_per_real_second) || 1) * 1000);
    const s = card.querySelector(".mo-timer span");
    if (s) s.style.width = `${Math.round(left / total * 100)}%`;
  }
  async respond(choice, btn) {
    const f = this.fight;
    if (!f) return;
    for (const b of btn.parentNode.querySelectorAll("button")) b.disabled = true;
    const r = await this.game.req("fight_respond", { fight: f.fight, choice });
    if (!r.ok) { this.closeLayer("fight"); this.fight = null; if (r.error.code !== "unknown_fight") this.game.ui.refusal(r); return; }
    this.fight = null;
    if (r.data.status === "brawl") { this.brawlStart(r.data); return; }
    this.fightResult(r.data);
  }
  // Fighting back with a person in it is Beat Brawl (brawl.js, D-077): its screen until the result comes.
  brawlStart(d) {
    if (!d || !d.fight) return;
    this.closeLayer("fight"); this.fight = null;
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    if (this.brawl && this.brawl.fight === d.fight && !this.brawl.closed) return;
    if (this.brawl) this.brawl.close();
    this.brawl = new BrawlScreen(this.game, d);
    this.game.ui.announce(`A fight with ${firstName(d.name || this.world.nameOf(d.with))}. Duck, block or jab on every beat.`);
  }
  fightResult(d) {
    if (!d) return;
    if (this.brawl && this.brawl.fight === d.fight) {
      const b = this.brawl;
      this.brawl = null;
      b.finish(d, () => this.fightResult(d));
      return;
    }
    this.closeLayer("fight"); this.fight = null;
    const who = firstName(d.name || this.world.nameOf(d.with));
    const won = d.won === true ? "You won" : d.won === false ? (d.role === "attacker" ? "You lost" : "You lost") : null;
    const crime = d.crime || {};
    const hearing = c => (c && c.hearing_text ? ` Your hearing: ${c.hearing_text}${c.courthouse ? ` at ${c.courthouse}` : ""}.` : "");
    const crimeLine = crime.arrested ? (d.role === "attacker" ? `Arrested for ${crime.crime || "assault"}${crime.fine_cents ? `: fined ${money(crime.fine_cents)}` : ""}${crime.jail_minutes ? `, held ${span(crime.jail_minutes)}` : ""}.${crime.court ? " Charged: the court decides the rest." : ""}` : crime.text)
      : crime.summoned ? `It was reported. You're charged with ${crime.crime || "assault"}.${hearing(crime)}`
      : crime.wanted ? `It was reported. You're wanted for ${crime.crime || "assault"}.`
      : crime.reported ? crime.text
      : crime.self_defence ? "Nothing landed. Nobody committed a crime." : crime.wanted === false ? "Nobody reported it. This time." : null;
    const selfDefence = d.role === "defender" && ["attacker_won", "defender_won", "knockout", "on_points", "broke_off", "walked_off"].includes(d.outcome);
    const fx = changesText(d.changes);
    const card = el("section", { class: `mo-card mo-fight mo-done${crime.arrested || crime.wanted || crime.summoned ? " mo-danger" : ""}`, role: "dialog", "aria-modal": "false", "aria-label": "How the fight went", dataset: { moment: "fight-result", outcome: d.outcome || "" } },
      el("div", { class: "mo-eyebrow" }, d.role === "attacker" ? `You started it · ${who}` : `${who} started it`),
      el("h2", { class: "mo-title" }, won || titleCase(String(d.outcome || "over").replace(/_/g, " "))),
      el("p", { class: "mo-outcome" }, d.text),
      fx ? el("p", { class: "mo-fx" }, fx) : null,
      selfDefence ? el("p", { class: "mo-crime" }, "You defended yourself: self-defence is never a crime.") : null,
      crimeLine ? el("p", { class: `mo-crime${crime.arrested || crime.wanted || crime.summoned ? " bad" : ""}` }, crimeLine) : null,
      (d.changes && d.changes.injuries && d.changes.injuries.length) ? el("p", { class: "mo-sub" }, "Injuries heal on their own, or faster with treatment at Riverdale Clinic or the hospital.") : null,
      el("div", { class: "mo-actions" }, el("button", { type: "button", class: "btn primary mo-big", onclick: () => this.closeLayer("fight-result") }, "OK")));
    this.showLayer("fight-result", card);
    this.game.ui.history.push({ who: "", text: `Fight with ${who}: ${d.text}${fx ? ` (${fx})` : ""}${crimeLine ? ` ${crimeLine}` : ""}`, kind: "result", cat: "activity", at: Date.now() });
    this.game.lastLook = 0; this.game.refreshBank();
    if (crime.wanted || crime.arrested || crime.summoned) setTimeout(() => this.refreshRecord(), 200);
  }
  // The fight on the map: a scuffle over both of them for a moment.
  scuffle(d) {
    const g = this.game;
    if (!d || !g.renderer) return;
    const text = d.stage === "started" ? "scuffle!" : d.stage === "brawl" ? "fight!" : d.outcome === "walked_away" ? "walked away" : d.outcome === "ran" ? "ran off" : d.outcome === "got_away" ? "got away" : d.outcome === "knockout" ? "down!" : "fight!";
    for (const id of [d.attacker, d.defender]) g.renderer.addFloater({ who: id, text, self: id === this.world.selfId });
    // A brawl lasts its rounds (about half a minute): the scuffle stays up until it's over.
    this.burst = { a: d.attacker, b: d.defender, until: performance.now() + (d.stage === "brawl" ? 30000 : d.stage === "started" ? 2600 : 1600) };
    if (d.stage === "over" && d.attacker !== this.world.selfId && d.defender !== this.world.selfId)
      g.ui.line("", `${this.world.nameOf(d.attacker)} started a fight with ${this.world.nameOf(d.defender)}${d.winner ? `: ${firstName(this.world.nameOf(d.winner))} came out on top` : ""}.`, "note");
  }

  // ------------------------------------------------------------ wanted, the arrest and the cell
  renderChips() {
    const parts = [];
    if (this.out) parts.push(el("button", { type: "button", class: "mo-chip held", dataset: { street: "out" }, onclick: () => this.showOut() }, icon("alert"), el("span", null, "Out cold"), el("span", { class: "num", id: "mo-out-left" }, this.leftText(this.out))));
    if (this.ward) parts.push(el("button", { type: "button", class: "mo-chip held", dataset: { street: "ward" }, onclick: () => this.showWard() }, icon("health"), el("span", null, "Hospital"), el("span", { class: "num", id: "mo-ward-left" }, this.leftText(this.ward))));
    if (this.jail) parts.push(el("button", { type: "button", class: "mo-chip held", dataset: { street: "held" }, onclick: () => this.showJail() }, icon("alert"), el("span", null, "Held"), el("span", { class: "num", id: "mo-held-left" }, this.jailLeftText())));
    else if (this.wanted) parts.push(el("button", { type: "button", class: "mo-chip wanted", dataset: { street: "wanted" }, "aria-label": `Wanted for ${this.wanted}: what it means`, onclick: () => this.showWanted() }, icon("alert"), el("span", null, `Wanted · ${this.wanted.toLowerCase()}`)));
    // The court (D-083): your date, your hearing under way, community service owed. The same chip styles as the street's.
    const ct = this.court;
    if (ct && ct.status === "hearing") parts.push(el("button", { type: "button", class: "mo-chip wanted", dataset: { street: "court" }, "aria-label": "Your hearing has begun: plead", onclick: () => this.openCourtroom(ct.case) }, icon("alert"), el("span", null, "In court · plead")));
    else if (ct && ct.status === "summoned" && typeof ct.hearing_at === "number" && !this.jail) parts.push(el("button", { type: "button", class: "mo-chip wanted", dataset: { street: "court" }, "aria-label": `Your court date: ${hhmm(ct.hearing_at)}`, onclick: () => this.openSummons(ct.case) }, icon("calendar"), el("span", null, "Court"), el("span", { class: "num" }, this.dayTime(ct.hearing_at))));
    if (ct && ct.service && !this.jail) parts.push(el("button", { type: "button", class: "mo-chip held", dataset: { street: "service" }, "aria-label": `Community service: ${ct.service.hours_left} hours left`, onclick: () => this.showService() }, icon("check"), el("span", null, ct.service.serving ? "Serving" : "Service"), el("span", { class: "num" }, `${ct.service.hours_left} h`)));
    replace(this.chips, parts);
    this.chips.hidden = !parts.length;
    if (this.game.ui && this.game.ui.measure) this.game.ui.measure();
  }
  jailLeftText() {
    const m = this.world.minute();
    return this.jail && m !== null ? span(Math.max(0, this.jail.until - m)) : "";
  }
  leftText(state) {
    const m = this.world.minute();
    return state && m !== null ? span(Math.max(0, state.until - m)) : "";
  }
  outCountdown() {
    for (const [id, state] of [["mo-out-left", this.out], ["mo-outcard-left", this.out], ["mo-ward-left", this.ward], ["mo-wardcard-left", this.ward]]) {
      const n = document.getElementById(id), t = this.leftText(state);
      if (n && n.textContent !== t) n.textContent = t;
    }
  }
  // ------------------------------------------------------------ a need run down to 0 (D-080)
  showOut() {
    if (!this.out) return;
    const card = el("section", { class: "mo-card mo-jail", role: "dialog", "aria-modal": "false", "aria-label": "Out cold", dataset: { moment: "out" } },
      el("div", { class: "mo-eyebrow" }, "Passed out"),
      el("h2", { class: "mo-title" }, "You're out cold"),
      el("p", { class: "mo-prompt" }, `You'll come to around ${hhmm(this.out.until)}.`),
      el("p", { class: "mo-countdown", id: "mo-outcard-left" }, this.leftText(this.out)),
      el("ul", { class: "mo-list" },
        el("li", null, `Time passes without you: a game hour is ${realHour(this.world.rules)}, and your needs wait until you come to.`),
        el("li", null, "You can't move, talk or use your phone until then."),
        el("li", null, "When you come to, eat and rest: run out of energy again and again and you'll catch Lantern Fatigue.")),
      el("div", { class: "mo-actions" }, el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("out") }, "Hide")));
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("out", card);
  }
  showWard() {
    if (!this.ward) return;
    const here = this.world.here, why = this.ward.need === "hunger" ? "You passed out from hunger." : this.ward.need === "health" ? "You collapsed: your health gave out." : "";
    const card = el("section", { class: "mo-card mo-jail", role: "dialog", "aria-modal": "false", "aria-label": "In the hospital", dataset: { moment: "ward" } },
      el("div", { class: "mo-eyebrow" }, "Hospital"),
      el("h2", { class: "mo-title" }, `Kept at ${here && here.name ? here.name : "the hospital"}`),
      el("p", { class: "mo-prompt" }, `${why ? `${why} ` : ""}Until ${hhmm(this.ward.until)}.`),
      el("p", { class: "mo-countdown", id: "mo-wardcard-left" }, this.leftText(this.ward)),
      el("div", { class: "mo-label" }, "What you can do"),
      el("ul", { class: "mo-list" },
        el("li", null, "Rest: they've stabilised you, and your needs wait until you leave."),
        el("li", null, "Use your phone: message people, check your money."),
        el("li", null, "You can't leave until they discharge you.")),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.game.openPhone() }, icon("phone"), "Phone"),
        el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("ward") }, "Hide")));
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("ward", card);
  }
  showDischarged() {
    this.closeLayer("ward");
    const card = el("section", { class: "mo-card", role: "dialog", "aria-modal": "false", "aria-label": "Discharged", dataset: { moment: "discharged" } },
      el("div", { class: "mo-eyebrow" }, "Discharged"),
      el("h2", { class: "mo-title" }, "You've been discharged. Take it easy."),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => { this.closeLayer("discharged"); if (this.world.self && this.world.self.inside) this.game.exit(); } }, icon("exit"), "Step outside"),
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.closeLayer("discharged") }, "OK")));
    this.showLayer("discharged", card);
  }
  showWanted() {
    const card = el("section", { class: "mo-card mo-danger", role: "dialog", "aria-modal": "false", "aria-label": "Wanted", dataset: { moment: "wanted" } },
      el("div", { class: "mo-eyebrow" }, icon("alert"), "Wanted"),
      el("h2", { class: "mo-title" }, `The police want you for ${this.wanted ? this.wanted.toLowerCase() : "a crime"}.`),
      el("ul", { class: "mo-list" },
        el("li", null, "Out in the open, a patrol can pick you up at any time, and an officer on duty who reaches you can arrest you."),
        el("li", null, this.world.rules && this.world.rules.court
          ? "Picked up, you're held in a cell until a new hearing and brought to court from it; anything illegal on you is seized."
          : "Arrested, you're fined and held, it goes on your record, and anything illegal on you is seized."),
        el("li", null, "Indoors, patrols don't come in. Nothing else about your day changes.")),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn mo-big", onclick: () => { this.closeLayer("wanted"); this.game.openPhone("record"); } }, "Your record"),
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => this.closeLayer("wanted") }, "OK")));
    this.showLayer("wanted", card);
  }
  async showJail() {
    if (!this.jail) return;
    const r = await this.game.req("phone", { app: "record" });
    const rec = r.ok ? r.data : {};
    const last = Array.isArray(rec.record) && rec.record.length ? rec.record[rec.record.length - 1] : null;
    const left = el("p", { class: "mo-countdown", id: "mo-jail-left" }, this.jailLeftText());
    const card = el("section", { class: "mo-card mo-jail", role: "dialog", "aria-modal": "false", "aria-label": "Held at the police station", dataset: { moment: "jail" } },
      el("div", { class: "mo-eyebrow" }, "Arrested"),
      el("h2", { class: "mo-title" }, `Held at ${rec.held_at || "the police station"}`),
      el("p", { class: "mo-prompt" }, `Until ${hhmm(this.jail.until)}.`), left,
      // Booked and charged (D-083): the court decides the rest; otherwise what the record says you're held for.
      rec.court && rec.court.status === "summoned" && typeof rec.court.hearing_at === "number"
        ? el("p", { class: "mo-fx", dataset: { court: "booked" } }, `Charged · your hearing is ${this.dayTime(rec.court.hearing_at)}${this.jail.until > rec.court.hearing_at ? ": you'll be brought to it from the cell" : ""}`)
        : last ? el("p", { class: "mo-fx" }, [last.crime, last.fine_cents ? `fined ${money(last.fine_cents)}` : "couldn't pay the fine", last.jail_minutes ? `${span(last.jail_minutes)} held` : ""].filter(Boolean).join(" · ")) : null,
      el("div", { class: "mo-label" }, "What you can do"),
      el("ul", { class: "mo-list" },
        el("li", null, `Wait it out: a game hour is ${realHour(this.world.rules)}. You'll be told when you're free.`),
        el("li", null, "Use your phone: message people, check your money and your record."),
        el("li", null, "You can't leave, work, buy or start anything until your time is served.")),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.game.openPhone() }, icon("phone"), "Phone"),
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.game.openPhone("record") }, "Record"),
        el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("jail") }, "Hide")));
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("jail", card);
  }
  jailCountdown() {
    const t = this.jailLeftText();
    for (const id of ["mo-jail-left", "mo-held-left"]) { const n = document.getElementById(id); if (n && n.textContent !== t) n.textContent = t; }
  }
  showFree() {
    this.closeLayer("jail");
    const card = el("section", { class: "mo-card", role: "dialog", "aria-modal": "false", "aria-label": "Free to go", dataset: { moment: "free" } },
      el("div", { class: "mo-eyebrow" }, "Released"),
      el("h2", { class: "mo-title" }, this.courtDate() ? "You're free to go until your hearing." : "You've served your time. You're free to go."),
      this.courtDate() ? el("p", { class: "mo-prompt" }, `Your hearing: ${this.dayTime(this.courtDate())} at ${this.courthouseName()}. Be there.`) : null,
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => { this.closeLayer("free"); if (this.world.self && this.world.self.inside) this.game.exit(); } }, icon("exit"), "Step outside"),
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.closeLayer("free") }, "OK")));
    this.showLayer("free", card);
  }

  // ------------------------------------------------------------ the court (D-083)
  // Every number on these cards is the server's: the odds it will roll, the sentence it will give.
  courtDate() { const c = this.court; return c && c.status === "summoned" && typeof c.hearing_at === "number" ? c.hearing_at : null; }
  courthouseName() { const r = this.world.rules && this.world.rules.court; return (r && r.courthouse_name) || "the courthouse"; }
  courthouseId() { const r = this.world.rules && this.world.rules.court; return (r && r.courthouse) || "courthouse"; }
  // "Tuesday 14:30", or "today 14:30" / "tomorrow 09:00".
  dayTime(minute) {
    const now = this.world.minute(), day = Math.floor(minute / 1440), today = now === null ? null : Math.floor(now / 1440);
    const name = today === day ? "today" : today !== null && day === today + 1 ? "tomorrow" : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day % 7];
    return `${name} ${hhmm(minute)}`;
  }
  async caseView(id) {
    const r = await this.game.req("phone", { app: "court" });
    if (!r.ok) return null;
    const all = [...(r.data.cases || []), ...(r.data.defending || []), ...(r.data.as_victim || [])];
    return all.find(k => k.case === id) || all.find(k => k.role === "accused" && k.status !== "decided") || null;
  }
  async openSummons(id) { const v = await this.caseView(id); if (v) this.showSummons(v); }
  async openCourtroom(id) { const v = await this.caseView(id); if (v && v.status === "hearing") this.showCourtroom(v); }
  charges(v) { const list = (v.charges || []).map(c => c.label || c); return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] || "a crime"; }
  // What the evidence is, in words: what the court counted.
  evidenceText(e) {
    if (!e) return "";
    const parts = [e.how === "caught" ? "caught in the act" : "reported"];
    if (e.witnesses) parts.push(plural(e.witnesses, "witness", "witnesses"));
    if (e.staff) parts.push(plural(e.staff, "member") + " of staff");
    if (e.police) parts.push(plural(e.police, "officer"));
    if (e.victim) parts.push("the victim's word");
    if (typeof e.in_court === "number" && e.in_court) parts.push(`${e.in_court} of them here`);
    if (e.victim_in_court) parts.push("the victim here");
    return parts.join(", ");
  }
  lawyerText(v) {
    const l = v.lawyer || {};
    if (l.kind === "firm") return `${l.name} defends you (paid).`;
    if (l.kind === "person") return `${l.name} ${l.agreed ? `defends you: ${money(l.fee_cents)}, paid when they stand up for you in court` : "hasn't answered yet"}${l.present === false ? ", and isn't here" : ""}.`;
    return "Nobody defends you.";
  }
  showSummons(v) {
    if (!v || !v.case) return;
    const odds = v.odds || {}, firm = (v.lawyers && v.lawyers.firm) || {};
    const when = typeof v.hearing_at === "number" ? `${this.dayTime(v.hearing_at)} at ${v.courthouse}` : "set when you're back in town";
    const card = el("section", { class: "mo-card mo-danger", role: "dialog", "aria-modal": "false", "aria-label": "Summons", dataset: { moment: "summons", case: v.case } },
      el("div", { class: "mo-eyebrow" }, icon("alert"), v.warrant ? "Warrant" : "Summons"),
      el("h2", { class: "mo-title" }, `You're charged with ${this.charges(v)}.`),
      el("p", { class: "mo-prompt" }, `Your hearing: ${when}.`),
      typeof odds.convicted_if_not_guilty === "number" ? el("p", { class: "mo-odds" }, `Plead not guilty and it's ${pct(odds.convicted_if_not_guilty)} you're convicted, as things stand (${this.evidenceText(v.evidence)}).`) : null,
      el("div", { class: "mo-ladder" }, el("div", { class: "mo-label" }, "In court"), el("ul", null,
        v.if_guilty_plea ? el("li", null, `Plead guilty: ${v.if_guilty_plea.text}.`) : null,
        v.if_convicted ? el("li", null, `Convicted on a not-guilty plea: ${v.if_convicted.text}. Otherwise it's dismissed and nothing goes on your record.`) : null,
        v.evidence && v.evidence.each_in_court_adds ? el("li", null, `Each witness who comes to the hearing adds ${Math.round(v.evidence.each_in_court_adds * 100)} points.`) : null,
        firm.name ? el("li", null, `A lawyer: ${firm.name}, ${money(firm.fee_cents)}, takes ${Math.round(firm.edge * 100)} points off (${pct(odds.with_firm)}). ${this.lawyerText(v)}`) : null,
        el("li", null, `Be in the courthouse at the time (up to ${(this.world.rules && this.world.rules.court && this.world.rules.court.grace_minutes) || 40} minutes late is still heard). Miss it and a warrant goes out for your arrest.`))),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", dataset: { court: "go" }, onclick: () => {
          if (this.jail) { this.game.ui.toast(`You're held until ${hhmm(this.jail.until)}: go when you're let out.`, false, { ms: 3500 }); return; }
          this.closeLayer("summons"); this.game.goTo(v.courthouse_id || this.courthouseId());
        } }, icon("go"), "Go to court"),
        firm.name && (!v.lawyer || v.lawyer.kind === "none") ? el("button", { type: "button", class: "btn mo-big", dataset: { court: "firm" }, onclick: e => this.hireFirm(v, e.currentTarget) }, `Hire ${firm.name}`) : null,
        el("button", { type: "button", class: "btn mo-big", onclick: () => { this.closeLayer("summons"); this.game.openPhone("calendar"); } }, "Calendar"),
        el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("summons") }, "OK")));
    this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("summons", card);
    this.game.ui.announce(`Summons: charged with ${this.charges(v)}. Hearing ${when}.`);
  }
  async hireFirm(v, btn) {
    if (btn) btn.disabled = true;
    const r = await this.game.req("court_lawyer", { case: v.case, lawyer: "firm" });
    if (btn) btn.disabled = false;
    if (!r.ok) { this.game.ui.refusal(r, "Hire a lawyer"); return; }
    this.game.refreshBank();
    this.game.ui.toast(`${r.data.lawyer.name} will defend you: ${pct(r.data.odds.convicted_if_not_guilty)} on a not-guilty plea now.`, false, { ms: 4000 });
    if (this.cards.has("courtroom")) this.showCourtroom(r.data); else if (this.cards.has("summons")) this.showSummons(r.data);
  }
  showCourtroom(v) {
    if (!v || !v.case || v.status !== "hearing") return;
    this.courtCase = v;
    const odds = v.odds || {}, firm = (v.lawyers && v.lawyers.firm) || {}, l = v.lawyer || {};
    const plea = (which, label, detail) => el("button", { type: "button", class: "btn mo-choice", dataset: { plea: which }, onclick: e => this.plead(v, which, e.currentTarget) },
      el("span", { class: "grow" }, label), el("span", { class: "mo-sub" }, detail));
    const card = el("section", { class: "mo-card mo-danger", role: "dialog", "aria-modal": "false", "aria-label": "Your hearing", dataset: { moment: "courtroom", case: v.case } },
      el("div", { class: "mo-eyebrow" }, `In court · ${v.courthouse}${v.judge ? ` · Judge ${v.judge}` : ""}`),
      el("h2", { class: "mo-title" }, `The charge: ${this.charges(v)}`),
      el("p", { class: "mo-odds", dataset: { odds: String(odds.convicted_if_not_guilty) } }, `Plead not guilty: ${pct(odds.convicted_if_not_guilty)} you're convicted. That's the court's own number: ${this.evidenceText(v.evidence)}.`),
      el("p", { class: "mo-sub" }, this.lawyerText(v)),
      el("div", { class: "mo-choices" },
        plea("guilty", "Guilty", v.if_guilty_plea ? v.if_guilty_plea.text : ""),
        plea("not_guilty", "Not guilty", v.if_convicted ? `${pct(odds.convicted_if_not_guilty)}: ${v.if_convicted.text}; otherwise dismissed` : "")),
      el("p", { class: "mo-countdown", id: "mo-plea-left" }, this.pleaLeftText(v)),
      el("p", { class: "mo-sub" }, "No plea in time and the court enters not guilty for you. The hearing is public: everyone here sees it."),
      el("div", { class: "mo-actions" },
        firm.name && l.kind === "none" ? el("button", { type: "button", class: "btn mo-big", dataset: { court: "firm" }, onclick: e => this.hireFirm(v, e.currentTarget) }, `Hire ${firm.name} · ${money(firm.fee_cents)} → ${pct(odds.with_firm)}`) : null,
        el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("courtroom") }, "Hide")));
    this.closeLayer("summons"); this.closeLayer("life"); if (this.offer && !this.offer.result) this.minimize();
    this.showLayer("courtroom", card);
    this.game.ui.announce(`Your hearing has begun: ${this.charges(v)}. Plead guilty or not guilty.`);
  }
  pleaLeftText(v) { const m = this.world.minute(); return v && typeof v.plea_by === "number" && m !== null ? `Plead by ${hhmm(v.plea_by)} (${span(Math.max(0, v.plea_by - m))} left)` : ""; }
  courtCountdown() { const n = document.getElementById("mo-plea-left"), t = this.pleaLeftText(this.courtCase); if (n && n.textContent !== t) n.textContent = t; }
  async plead(v, which, btn) {
    for (const b of btn.parentNode.querySelectorAll("button")) b.disabled = true;
    const r = await this.game.req("court_plea", { case: v.case, plea: which });
    if (!r.ok) { for (const b of btn.parentNode.querySelectorAll("button")) b.disabled = false; this.game.ui.refusal(r, "Plead"); if (r.error.code === "already_decided") this.closeLayer("courtroom"); return; }
    this.showVerdict(r.data);
    this.lookSoon(); this.game.refreshBank();
  }
  showVerdict(v) {
    if (!v || !v.case || !v.verdict) return;
    if (this.verdictShown === v.case) return;  // the reply and the event both carry it
    this.verdictShown = v.case;
    this.closeLayer("courtroom");
    const mine = v.role === "accused", convicted = v.verdict === "convicted", s = v.sentence || {};
    const title = mine ? (convicted ? (v.plea === "guilty" ? "Convicted on your plea" : "Convicted") : "Not guilty: case dismissed") : (convicted ? `${v.accused_name}: convicted` : `${v.accused_name}: case dismissed`);
    const lines = [];
    if (convicted && s.text) lines.push(`Sentence: ${s.text}${s.fine_unpaid ? " (the fine couldn't be paid, so the time is longer)" : ""}.`);
    if (mine && v.plea !== "guilty" && typeof v.chance === "number") lines.push(`The court rolled the ${pct(v.chance)} it showed you.`);
    if (mine && v.plea === "entered") lines.push("You didn't plead in time: the court entered not guilty for you.");
    if (mine && convicted) lines.push("It's on your record. Employers that need a clean record see it until it's spent.");
    if (mine && s.service_hours) lines.push(`Do your community service at ${(this.world.rules && this.world.rules.court && this.world.rules.court.community_service.place_name) || "the community center"}.`);
    const card = el("section", { class: `mo-card mo-done${convicted && mine ? " mo-danger" : ""}`, role: "dialog", "aria-modal": "false", "aria-label": "The verdict", dataset: { moment: "verdict", verdict: v.verdict, case: v.case } },
      el("div", { class: "mo-eyebrow" }, `Verdict · ${v.courthouse}${v.judge ? ` · Judge ${v.judge}` : ""}`),
      el("h2", { class: "mo-title" }, title),
      v.text ? el("p", { class: "mo-outcome" }, v.text) : null,
      lines.length ? el("ul", { class: "mo-list" }, lines.map(t => el("li", null, t))) : null,
      el("div", { class: "mo-actions" },
        mine && s.service_hours ? el("button", { type: "button", class: "btn mo-big", onclick: () => { this.closeLayer("verdict"); this.game.goTo((this.world.rules.court.community_service || {}).place); } }, icon("go"), "Go to do it") : null,
        mine && convicted ? el("button", { type: "button", class: "btn mo-big", onclick: () => { this.closeLayer("verdict"); this.game.openPhone("record"); } }, "Record") : null,
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => this.closeLayer("verdict") }, "OK")));
    this.showLayer("verdict", card);
    this.game.ui.history.push({ who: "", text: `${title}. ${v.text || ""}`, kind: "result", cat: "activity", at: Date.now() });
    this.game.ui.announce(title);
  }
  // A lawyer asked to defend someone (multiplayer: a person whose career is the law).
  showBrief(v) {
    if (!v || !v.case) return;
    const card = el("section", { class: "mo-card", role: "dialog", "aria-modal": "false", "aria-label": "Asked to defend someone", dataset: { moment: "brief", case: v.case } },
      el("div", { class: "mo-eyebrow" }, "A client"),
      el("h2", { class: "mo-title" }, `${v.asked_by || v.accused_name} asks you to defend them.`),
      el("p", { class: "mo-prompt" }, `Charged with ${this.charges(v)}. Hearing: ${typeof v.hearing_at === "number" ? `${this.dayTime(v.hearing_at)} at ${v.courthouse}` : "not set yet"}.`),
      el("ul", { class: "mo-list" },
        el("li", null, `Your fee: ${money(v.fee_cents)}, paid when the hearing opens with you in the courtroom. Not there, not paid, and you don't count.`),
        v.odds ? el("li", null, `As it stands, ${pct(v.odds.convicted_if_not_guilty)} on a not-guilty plea (${this.evidenceText(v.evidence)}); with you there, ${Math.round(((v.lawyer && v.lawyer.edge) || 0) * 100)} points less.`) : null),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", dataset: { brief: "yes" }, onclick: e => this.represent(v, true, e.currentTarget) }, "Defend them"),
        el("button", { type: "button", class: "btn mo-big", dataset: { brief: "no" }, onclick: e => this.represent(v, false, e.currentTarget) }, "Decline")));
    this.showLayer("brief", card);
  }
  async represent(v, accept, btn) {
    btn.disabled = true;
    const r = await this.game.req("court_represent", { case: v.case, accept });
    this.closeLayer("brief");
    if (!r.ok) { this.game.ui.refusal(r, "Answer"); return; }
    this.game.ui.toast(accept ? `You'll defend ${v.accused_name}. Be in the courtroom at the hearing.` : "You said no.", false, { ms: 3500 });
  }
  lawyerAnswered(v) {
    const l = (v && v.lawyer) || {};
    this.game.ui.toast(l.agreed ? `${l.name} will defend you.` : "Your lawyer said no.", false, { ms: 3500 });
    if (this.cards.has("summons")) this.showSummons(v);
  }
  // Community service you owe: where, how much, start or stop it there.
  showService() {
    const sv = this.court && this.court.service;
    if (!sv) return;
    const rules = (this.world.rules && this.world.rules.court && this.world.rules.court.community_service) || {};
    const here = this.world.self && this.world.self.inside === rules.place;
    const card = el("section", { class: "mo-card", role: "dialog", "aria-modal": "false", "aria-label": "Community service", dataset: { moment: "service" } },
      el("div", { class: "mo-eyebrow" }, "Community service"),
      el("h2", { class: "mo-title" }, `${sv.hours_left} h left at ${rules.place_name || "the community center"}`),
      el("p", { class: "mo-prompt" }, `Due ${typeof sv.due === "number" ? this.dayTime(sv.due) : "soon"}. Undone by then, a warrant goes out, and picked up you serve the hours left in a cell.`),
      el("p", { class: "mo-sub" }, "It counts while you stay there, an hour at a time; walking out stops it."),
      el("div", { class: "mo-actions" },
        sv.serving ? el("button", { type: "button", class: "btn mo-big", dataset: { service: "stop" }, onclick: () => this.serve("stop") }, "Stop")
          : here ? el("button", { type: "button", class: "btn primary mo-big", dataset: { service: "start" }, onclick: () => this.serve("start") }, "Start")
          : el("button", { type: "button", class: "btn primary mo-big", onclick: () => { this.closeLayer("service"); this.game.goTo(rules.place); } }, icon("go"), "Go there"),
        el("button", { type: "button", class: "btn link", onclick: () => this.closeLayer("service") }, "Hide")));
    this.showLayer("service", card);
  }
  async serve(action) {
    const r = await this.game.req("community_service", { action });
    this.closeLayer("service");
    if (!r.ok) { this.game.ui.refusal(r, "Community service"); return; }
    this.game.ui.toast(action === "start" ? `Serving: ${r.data.hours_left} h left. Stay here.` : `Stopped: ${r.data.hours_left} h left.`, false, { ms: 3500 });
    this.lookSoon();
  }
  // What everyone in the courtroom sees: a hearing is public.
  courtroomLine(d) {
    if (!d || !d.stage) return;
    const mine = d.accused === this.world.selfId;
    const charges = Array.isArray(d.charges) ? d.charges.join(", ").toLowerCase() : "a crime";
    const text = d.stage === "opened" ? `In court: ${d.accused_name}, charged with ${charges}.${d.judge ? ` Judge ${d.judge} is on the bench.` : ""}`
      : d.stage === "verdict" ? `In court: ${d.text || `${d.accused_name}: ${d.verdict}.`}`
      : d.stage === "adjourned" ? `In court: ${d.accused_name}'s hearing was put off.`
      : d.stage === "warrant" ? `In court: ${d.accused_name} didn't come. A warrant goes out.` : "";
    if (!text || (mine && d.stage !== "opened")) return;
    this.game.ui.line("", text, "note");
    const r = this.game.renderer;
    if (r && typeof r.addFloater === "function" && d.stage === "verdict") r.addFloater({ who: d.accused, text: d.verdict === "convicted" ? "convicted" : "cleared", self: mine });
  }

  // The You card's street lines (ui.js asks game.youExtras()).
  youNodes() {
    const out = [el("div", { class: "eyebrow" }, "The street")];
    if (this.jail) out.push(el("p", { class: "mo-you bad" }, `Held at the police station until ${hhmm(this.jail.until)}.`));
    else if (this.wanted) out.push(el("p", { class: "mo-you bad" }, `Wanted for ${this.wanted.toLowerCase()}. Patrols pick up wanted people out in the open.`));
    else out.push(el("p", { class: "hint" }, "Not wanted by the police."));
    // Your case (D-083).
    const ct = this.court;
    if (ct && ct.status === "hearing") out.push(el("p", { class: "mo-you bad" }, "Your hearing is under way: plead guilty or not guilty."));
    else if (this.courtDate()) out.push(el("p", { class: "mo-you bad", dataset: { court: "date" } }, `Your hearing: ${this.dayTime(this.courtDate())} at ${this.courthouseName()}.`));
    if (ct && ct.service) out.push(el("p", { class: "mo-you" }, `Community service: ${ct.service.hours_left} h left, due ${this.dayTime(ct.service.due)}.`));
    if (ct && typeof ct.probation_until === "number") out.push(el("p", { class: "mo-you" }, `On probation until ${this.dayTime(ct.probation_until)}: convicted again, it's time in a cell.`));
    if (ct && ct.defending) out.push(el("p", { class: "mo-you" }, `You're defending ${ct.defending.client}${typeof ct.defending.hearing_at === "number" ? `, ${this.dayTime(ct.defending.hearing_at)}` : ""}.`));
    const box = el("input", { type: "checkbox", checked: this.walkAway === true, onchange: async () => {
      box.disabled = true;
      const r = await this.game.req("fight_prefs", { walk_away: box.checked });
      box.disabled = false;
      if (r.ok) { this.walkAway = r.data.walk_away_from_fights; this.game.ui.toast(this.walkAway ? "You'll always walk away from fights: nothing will land on you." : "You'll choose what to do if someone starts a fight."); }
      else { box.checked = !box.checked; this.game.ui.refusal(r); }
    } });
    out.push(el("label", { class: "choice", dataset: { pref: "walk_away" } }, box, el("span", { class: "grow" }, "Always walk away from fights",
      el("span", { class: "near" }, "Nobody can hurt you in a fight; whoever starts one still loses face. One fight per pair a day, and protection after one, either way."))));
    if (this.walkAway === null) this.refreshRecord().then(() => { box.checked = this.walkAway === true; });
    return out;
  }

  // ------------------------------------------------------------ the map: officers' badges, the scuffle
  frame() {
    const g = this.game, r = g.renderer;
    if (!r || g.phase !== "playing") { if (this.badges.firstChild) replace(this.badges); return; }
    const want = [];
    const rect = r.canvas.getBoundingClientRect(), app = document.getElementById("app").getBoundingClientRect();
    // Inside a room the interiors view (interior.js) draws people, and the town isn't drawn: ask it where they are
    // (page coordinates, read-only). Otherwise the town's own hit circles say where each portrait is.
    const room = g.interiors && typeof g.interiors.covering === "function" && g.interiors.covering() ? g.interiors : null;
    const hits = !room && Array.isArray(r.hit) ? r.hit : [];
    const circle = id => {
      if (room) { const q = room.personScreen(id); return q ? [q[0] - rect.left, q[1] - rect.top, 18] : null; }
      const h = hits.find(x => x.kind === "person" && x.id === id && x.circle); return h ? h.circle : null;
    };
    for (const p of this.world.people.values()) {
      if (p.uniform !== "police") continue;
      // Beside their name plate when the town draws one (its tap target is the plate's rectangle), else over them.
      const plate = hits.find(x => x.kind === "person" && x.id === p.id && x.rect && x.circle && x.circle[2] === 1);
      if (plate) { want.push({ id: p.id, plate: true, x: plate.rect[2] + 4 + rect.left - app.left, y: (plate.rect[1] + plate.rect[3]) / 2 + rect.top - app.top }); continue; }
      const c = circle(p.id);
      if (c) want.push({ id: p.id, x: c[0] + rect.left - app.left, y: c[1] + rect.top - app.top - Math.max(14, c[2] - 6) - 12 });
    }
    const b = this.burst;
    if (b && performance.now() < b.until) {
      const ca = circle(b.a) || (!room && b.a === this.world.selfId ? this.selfCircle() : null), cb = circle(b.b) || (!room && b.b === this.world.selfId ? this.selfCircle() : null);
      const pts = [ca, cb].filter(Boolean);
      if (pts.length) want.push({ burst: true, x: pts.reduce((s, c) => s + c[0], 0) / pts.length + rect.left - app.left, y: pts.reduce((s, c) => s + c[1], 0) / pts.length + rect.top - app.top });
    } else this.burst = null;
    const key = want.map(w => `${w.id || "b"}${Math.round(w.x)},${Math.round(w.y)}`).join("|");
    if (key === this.badgeKey) return;
    this.badgeKey = key;
    replace(this.badges, want.map(w => w.burst
      ? el("span", { class: "mo-burst", style: { left: `${w.x}px`, top: `${w.y}px` } }, el("i"), el("i"), el("i"))
      : el("span", { class: `mo-badge${w.plate ? " at-plate" : ""}`, style: { left: `${w.x}px`, top: `${w.y}px` } }, el("i", { class: "mo-shield" }), "Police")));
  }
  selfCircle() {
    const r = this.game.renderer, w = this.world;
    if (!r || typeof r.project !== "function" || !w.selfPos) return null;
    const p = w.selfPos();
    if (!p) return null;
    const s = r.project(p[0], p[1], 0);
    return [s[0], s[1] - 20, 16];
  }
}

// ------------------------------------------------------------------ the Court app (phone.js, D-083)
// Your cases as the court shows them to you: the charges, the date, the honest odds and the sentence; the cases you're
// the victim in; the ones you defend; the bench's docket if you sit on it.
export function courtScreen(d) {
  const phone = this, game = phone.game, m = game.moments;
  const card = (...c) => el("div", { class: "card" }, c);
  const when = t => (typeof t === "number" && m ? m.dayTime(t) : "not set yet");
  const charges = v => (m ? m.charges(v) : (v.charges || []).map(c => c.label).join(", "));
  const out = [];
  const rules = d.rules || {};
  const mine = Array.isArray(d.cases) ? d.cases : [];
  if (!mine.length) out.push(card(el("div", { class: "eyebrow" }, "Your cases"), el("p", { class: "hint" }, "No cases. Charged with a crime the court tries, your case and its date show here.")));
  for (const v of mine) {
    const decided = v.status === "decided";
    const rows = [el("div", { class: "eyebrow" }, decided ? `Decided · ${v.verdict === "convicted" ? "convicted" : "dismissed"}` : v.status === "warrant" ? "Warrant: you missed your hearing" : v.status === "hearing" ? "Hearing under way" : "Summoned"),
      el("h3", null, charges(v)),
      el("p", { class: "hint" }, decided ? (v.sentence ? `Sentence: ${v.sentence.text}.` : "Nothing on your record.") : `Hearing: ${when(v.hearing_at)} at ${v.courthouse}.`)];
    if (!decided && v.odds) rows.push(el("p", null, `Plead not guilty: ${pct(v.odds.convicted_if_not_guilty)} you're convicted${v.odds.final ? "" : ", as things stand"}. Guilty: ${v.if_guilty_plea ? v.if_guilty_plea.text : "?"}.`),
      el("p", { class: "hint" }, m ? `${m.evidenceText(v.evidence)}. ${m.lawyerText(v)}` : ""));
    if (decided && v.sentence && v.sentence.service_hours) rows.push(el("p", { class: "hint" }, `Community service: ${v.sentence.service_done || 0} of ${v.sentence.service_hours} h done${v.sentence.breached ? " (a warrant: it wasn't done in time)" : ""}.`));
    const actions = [];
    if (v.status === "hearing" && m) actions.push(el("button", { type: "button", class: "btn small", onclick: () => { phone.close(); m.showCourtroom(v); } }, "Plead"));
    if (v.status === "summoned") actions.push(el("button", { type: "button", class: "btn small", onclick: () => { phone.close(); game.goTo(v.courthouse_id); } }, icon("go"), "Go to court"));
    if (!decided && v.lawyer && v.lawyer.kind === "none" && v.lawyers && m) actions.push(el("button", { type: "button", class: "btn small", onclick: e => m.hireFirm(v, e.currentTarget).then(() => phone.reload()) }, `Hire ${v.lawyers.firm.name} · ${money(v.lawyers.firm.fee_cents)}`));
    if (actions.length) rows.push(el("div", { class: "row" }, actions));
    out.push(el("div", { class: "card", dataset: { case: v.case } }, rows));
  }
  for (const v of d.defending || []) out.push(card(el("div", { class: "eyebrow" }, v.lawyer && v.lawyer.agreed ? "You defend" : "Asked to defend"), el("h3", null, `${v.accused_name}: ${charges(v)}`),
    el("p", { class: "hint" }, `Hearing: ${when(v.hearing_at)} at ${v.courthouse}. Be in the courtroom: that's when you're paid and count.`),
    !(v.lawyer && v.lawyer.agreed) && m ? el("div", { class: "row" }, el("button", { type: "button", class: "btn small", onclick: () => { phone.close(); m.showBrief(v); } }, "Answer")) : null));
  for (const v of d.as_victim || []) out.push(card(el("div", { class: "eyebrow" }, "Your case against someone"), el("h3", null, `${v.accused_name}: ${charges(v)}`),
    el("p", { class: "hint" }, v.status === "decided" ? (v.verdict === "convicted" ? `Convicted: ${v.sentence ? v.sentence.text : ""}.` : "Dismissed.") : `Hearing: ${when(v.hearing_at)} at ${v.courthouse}. It's public: come, and your word counts for more.`)));
  if (Array.isArray(d.docket)) out.push(card(el("div", { class: "eyebrow" }, "The docket"), d.docket.length
    ? el("ul", { class: "list" }, d.docket.map(k => el("li", null, el("span", null, `${k.hearing_text}: ${k.accused_name}`), el("span", { class: "hint" }, ` · ${(k.charges || []).join(", ")}${k.status === "hearing" ? " · under way" : ""}`))))
    : el("p", { class: "hint" }, "No hearings set.")));
  if (rules.courthouse_name) out.push(card(el("div", { class: "eyebrow" }, "How the court works"),
    el("p", { class: "hint" }, `${rules.courthouse_name} sits ${(rules.sitting_days || []).join(", ")}, ${String(rules.sitting_hours[0]).padStart(2, "0")}:00 to ${String(rules.sitting_hours[1]).padStart(2, "0")}:00. Pleading guilty takes ${Math.round(rules.guilty_plea_discount * 100)}% off the sentence. ${rules.firm ? `${rules.firm.name} defends anyone for ${money(rules.firm.fee_cents)}.` : ""} Only employers that need a clean record see a conviction, and only until it's spent (${rules.record_days ? rules.record_days.conviction : "?"} days).`)));
  return out;
}

// ------------------------------------------------------------------ the Story app (phone.js)
const KIND_WORD = {
  life_event: "A moment", first_meeting: "Met someone", birthday: "Birthday", promotion: "Promotion", arrest: "Arrested", fight: "A fight",
  saw_fight: "Saw a fight", saw_crime: "Saw a crime", robbed: "Robbed", wet_myself: "Accident", saw_accident: "Saw an accident", date: "A date",
};
export function storyScreen(d) {
  const phone = this, game = phone.game;
  const card = (...c) => el("div", { class: "card" }, c);
  const pending = Array.isArray(d.pending) ? d.pending : [];
  const story = Array.isArray(d.story) ? d.story : [];
  const out = [];
  out.push(card(el("div", { class: "eyebrow" }, "Your life"), el("h3", { class: "mo-story-age" }, `Age ${d.age ?? "?"}`),
    el("p", { class: "hint" }, `${plural(d.answered || 0, "moment")} you chose your way through. ${d.note || ""}`)));
  for (const o of pending) {
    const res = el("p", { class: "result", role: "status" });
    const box = el("div", { class: "mo-choices" }, (o.choices || []).map(c => el("button", { type: "button", class: "btn small mo-choice", dataset: { option: String(c.option) }, onclick: async e => {
      for (const b of box.querySelectorAll("button")) b.disabled = true;
      const r = await game.req("event_answer", { event: o.event, option: c.option });
      if (!r.ok) { for (const b of box.querySelectorAll("button")) b.disabled = false; res.textContent = sentence(r.error.message); res.className = "result bad"; return; }
      const m = game.moments; if (m) { m.answered.add(m.key(o)); if (m.offer && m.offer.event === o.event) { m.offer = null; m.pill.hidden = true; m.closeLayer("life"); } m.afterChange(r.data.changes); }
      replace(box, el("p", { class: "mo-outcome" }, r.data.outcome), el("p", { class: "mo-fx" }, changesText(r.data.changes)));
      void e;
      setTimeout(() => phone.reload(), 2500);
    } }, el("span", { class: "grow" }, c.label), typeof c.cost_cents === "number" ? el("span", { class: "mo-cost" }, costText(c)) : null)));
    out.push(el("div", { class: "card mo-story-pending", dataset: { event: o.event } }, el("div", { class: "eyebrow" }, `Waiting · ${CATEGORY[o.category] || "a moment"}`),
      el("h3", null, o.title), el("p", null, o.prompt), box, res,
      el("p", { class: "hint" }, o.lapses_in_minutes ? `Passes in ${span(o.lapses_in_minutes)}.` : "")));
  }
  if (!story.length) out.push(card(el("p", { class: "hint" }, "Nothing yet. What you live through ends up here: the people you meet, the moments you choose, the days that matter.")));
  else {
    const byAge = new Map();
    for (const s of story) { const k = Number(s.age) || 0; if (!byAge.has(k)) byAge.set(k, []); byAge.get(k).push(s); }
    for (const [age, items] of byAge) {
      out.push(el("div", { class: "card mo-story" }, el("div", { class: "eyebrow" }, `Age ${age}`),
        el("ol", { class: "mo-timeline" }, items.map(s => el("li", { class: `${s.life_event ? "moment" : ""}${s.impact < 0 ? " low" : s.impact > 0 ? " high" : ""}`, dataset: { kind: s.kind } },
          el("span", { class: "mo-when" }, `${KIND_WORD[s.kind] || titleCase(String(s.kind || "").replace(/_/g, " "))}${s.when ? ` · ${String(s.when).replace(/^\w+, Year \d+ /, "").replace(/, (\d\d:\d\d)$/, " · $1")}` : ""}`),
          el("span", { class: "mo-what" }, s.text))))));
    }
  }
  return out;
}
