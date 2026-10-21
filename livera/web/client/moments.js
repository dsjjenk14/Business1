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
  if (c.jail_minutes) lines.push(`Held ${span(c.jail_minutes)} at ${c.held_at || "the police station"}`);
  if (c.fine_cents) lines.push(`A ${money(c.fine_cents)} fine${c.jail_if_unpaid_minutes ? `; if you can't pay it, held ${span(c.jail_if_unpaid_minutes)} instead` : ""}`);
  if (c.record) lines.push(`${r.label || "It"} on your record`);
  if (c.notoriety) lines.push("People hear about it");
  if (r.crime !== "fare_evasion" && c.seized) { const t = sentence(c.seized).replace(/\.$/, ""); lines.push(t[0].toUpperCase() + t.slice(1)); }
  // What can follow even when nobody stops you.
  const after = [];
  if (typeof r.notice_chance === "number") after.push(`${pct(r.notice_chance)} chance they notice, report you, and you're wanted`);
  if (typeof r.report_chance === "number") after.push(`${pct(r.report_chance)} chance they report you, and you're wanted${typeof r.witness_report_chance === "number" ? ` (more with anyone else watching)` : ""}`);
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
    this.jail = null;         // {until, at} while held
    this.wanted = null;
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
        wanted: () => this.wanted, jail: () => this.jail,
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
      if (look && Array.isArray(look.people)) for (const p of look.people) { const e = w.people.get(p.id); if (e) e.uniform = p.uniform || null; }
      if (look && look.you && typeof look.you === "object") self.standing(look.you);
    };
    w.applyPeople = (changes, now) => {
      applyPeople(changes, now);
      for (const c of Array.isArray(changes) ? changes : []) { const e = c && w.people.get(c.character); if (e && c.state !== "gone") e.uniform = c.uniform || null; }
    };
  }

  standing(you) {
    const wanted = typeof you.wanted_for === "string" ? you.wanted_for : null;
    const until = Number.isFinite(you.jailed_until) ? you.jailed_until : null;
    if (wanted !== this.wanted) { this.wanted = wanted; this.renderChips(); }
    const was = this.jail;
    if (until && (!was || was.until !== until)) { this.jail = { until }; this.renderChips(); this.showJail(); }
    if (!until && was) { this.jail = null; this.renderChips(); this.showFree(); }
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
  reset() { for (const k of [...this.cards.keys()]) this.closeLayer(k); this.offer = null; this.queue = []; this.pill.hidden = true; this.fight = null; this.jail = null; this.wanted = null; this.renderChips(); }

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
  }

  // ------------------------------------------------------------ life events
  arrive(d) {
    if (!d || !d.event || this.answered.has(this.key(d))) return;
    if (this.offer && !this.offer.result) { if (this.offer.event !== d.event) this.queue.push(d); return; }
    this.offer = d;
    // Not over a fight or a cell: it waits in the pill.
    if (this.cards.has("fight") || this.cards.has("jail") || this.cards.has("confirm")) this.minimize(); else this.showOffer();
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
    this.fightResult(r.data);
  }
  fightResult(d) {
    if (!d) return;
    this.closeLayer("fight"); this.fight = null;
    const who = firstName(d.name || this.world.nameOf(d.with));
    const won = d.won === true ? "You won" : d.won === false ? (d.role === "attacker" ? "You lost" : "You lost") : null;
    const crime = d.crime || {};
    const crimeLine = crime.arrested ? (d.role === "attacker" ? `Arrested for ${crime.crime || "assault"}${crime.fine_cents ? `: fined ${money(crime.fine_cents)}` : ""}${crime.jail_minutes ? `, held ${span(crime.jail_minutes)}` : ""}.` : crime.text)
      : crime.wanted ? `It was reported. You're wanted for ${crime.crime || "assault"}.`
      : crime.reported ? crime.text
      : crime.self_defence ? "Nothing landed. Nobody committed a crime." : crime.wanted === false ? "Nobody reported it. This time." : null;
    const selfDefence = d.role === "defender" && (d.outcome === "attacker_won" || d.outcome === "defender_won");
    const fx = changesText(d.changes);
    const card = el("section", { class: `mo-card mo-fight mo-done${crime.arrested || crime.wanted ? " mo-danger" : ""}`, role: "dialog", "aria-modal": "false", "aria-label": "How the fight went", dataset: { moment: "fight-result", outcome: d.outcome || "" } },
      el("div", { class: "mo-eyebrow" }, d.role === "attacker" ? `You started it · ${who}` : `${who} started it`),
      el("h2", { class: "mo-title" }, won || titleCase(String(d.outcome || "over").replace(/_/g, " "))),
      el("p", { class: "mo-outcome" }, d.text),
      fx ? el("p", { class: "mo-fx" }, fx) : null,
      selfDefence ? el("p", { class: "mo-crime" }, "You defended yourself: self-defence is never a crime.") : null,
      crimeLine ? el("p", { class: `mo-crime${crime.arrested || crime.wanted ? " bad" : ""}` }, crimeLine) : null,
      (d.changes && d.changes.injuries && d.changes.injuries.length) ? el("p", { class: "mo-sub" }, "Injuries heal on their own, or faster with treatment at Riverdale Clinic or the hospital.") : null,
      el("div", { class: "mo-actions" }, el("button", { type: "button", class: "btn primary mo-big", onclick: () => this.closeLayer("fight-result") }, "OK")));
    this.showLayer("fight-result", card);
    this.game.ui.history.push({ who: "", text: `Fight with ${who}: ${d.text}${fx ? ` (${fx})` : ""}${crimeLine ? ` ${crimeLine}` : ""}`, kind: "result", cat: "activity", at: Date.now() });
    this.game.lastLook = 0; this.game.refreshBank();
    if (crime.wanted || crime.arrested) setTimeout(() => this.refreshRecord(), 200);
  }
  // The fight on the map: a scuffle over both of them for a moment.
  scuffle(d) {
    const g = this.game;
    if (!d || !g.renderer) return;
    const text = d.stage === "started" ? "scuffle!" : d.outcome === "walked_away" ? "walked away" : d.outcome === "ran" ? "ran off" : d.outcome === "got_away" ? "got away" : "fight!";
    for (const id of [d.attacker, d.defender]) g.renderer.addFloater({ who: id, text, self: id === this.world.selfId });
    this.burst = { a: d.attacker, b: d.defender, until: performance.now() + (d.stage === "started" ? 2600 : 1600) };
    if (d.stage === "over" && d.attacker !== this.world.selfId && d.defender !== this.world.selfId)
      g.ui.line("", `${this.world.nameOf(d.attacker)} started a fight with ${this.world.nameOf(d.defender)}${d.winner ? `: ${firstName(this.world.nameOf(d.winner))} came out on top` : ""}.`, "note");
  }

  // ------------------------------------------------------------ wanted, the arrest and the cell
  renderChips() {
    const parts = [];
    if (this.jail) parts.push(el("button", { type: "button", class: "mo-chip held", dataset: { street: "held" }, onclick: () => this.showJail() }, icon("alert"), el("span", null, "Held"), el("span", { class: "num", id: "mo-held-left" }, this.jailLeftText())));
    else if (this.wanted) parts.push(el("button", { type: "button", class: "mo-chip wanted", dataset: { street: "wanted" }, "aria-label": `Wanted for ${this.wanted}: what it means`, onclick: () => this.showWanted() }, icon("alert"), el("span", null, `Wanted · ${this.wanted.toLowerCase()}`)));
    replace(this.chips, parts);
    this.chips.hidden = !parts.length;
    if (this.game.ui && this.game.ui.measure) this.game.ui.measure();
  }
  jailLeftText() {
    const m = this.world.minute();
    return this.jail && m !== null ? span(Math.max(0, this.jail.until - m)) : "";
  }
  showWanted() {
    const card = el("section", { class: "mo-card mo-danger", role: "dialog", "aria-modal": "false", "aria-label": "Wanted", dataset: { moment: "wanted" } },
      el("div", { class: "mo-eyebrow" }, icon("alert"), "Wanted"),
      el("h2", { class: "mo-title" }, `The police want you for ${this.wanted ? this.wanted.toLowerCase() : "a crime"}.`),
      el("ul", { class: "mo-list" },
        el("li", null, "Out in the open, a patrol can pick you up at any time, and an officer on duty who reaches you can arrest you."),
        el("li", null, "Arrested, you're fined and held, it goes on your record, and anything illegal on you is seized."),
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
      last ? el("p", { class: "mo-fx" }, [last.crime, last.fine_cents ? `fined ${money(last.fine_cents)}` : "couldn't pay the fine", last.jail_minutes ? `${span(last.jail_minutes)} held` : ""].filter(Boolean).join(" · ")) : null,
      el("div", { class: "mo-label" }, "What you can do"),
      el("ul", { class: "mo-list" },
        el("li", null, "Wait it out: a game hour is a real minute. You'll be told when you're free."),
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
      el("h2", { class: "mo-title" }, "You've served your time. You're free to go."),
      el("div", { class: "mo-actions" },
        el("button", { type: "button", class: "btn primary mo-big", onclick: () => { this.closeLayer("free"); if (this.world.self && this.world.self.inside) this.game.exit(); } }, icon("exit"), "Step outside"),
        el("button", { type: "button", class: "btn mo-big", onclick: () => this.closeLayer("free") }, "OK")));
    this.showLayer("free", card);
  }

  // The You card's street lines (ui.js asks game.youExtras()).
  youNodes() {
    const out = [el("div", { class: "eyebrow" }, "The street")];
    if (this.jail) out.push(el("p", { class: "mo-you bad" }, `Held at the police station until ${hhmm(this.jail.until)}.`));
    else if (this.wanted) out.push(el("p", { class: "mo-you bad" }, `Wanted for ${this.wanted.toLowerCase()}. Patrols pick up wanted people out in the open.`));
    else out.push(el("p", { class: "hint" }, "Not wanted by the police."));
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
