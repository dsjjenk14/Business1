// A first morning (spec R1.7): three lines of "how it works" for the town screen, a checklist that
// ticks itself from real game state, and three one-time coach marks. The checklist only reads what
// the client already sees (you stepped outside, a buy or a meal went through, you're inside your
// workplace, you're on shift, a work call or a hello went through); it never decides anything. Its
// progress is a per-viewer convenience kept in localStorage per character (and account or save),
// so it can be lost with the browser's storage without any harm.

import { el, store } from "./dom.js";
import { icon } from "./icons.js";

export const HOW_IT_WORKS = [
  "You live one life in a town that keeps running.",
  "Tap the ground to walk, and a building to go in.",
  "Work pays; food, sleep and people keep you going.",
];
export const howItWorks = () => el("div", { class: "how", id: "how-it-works" },
  el("div", { class: "eyebrow" }, "How it works"), el("ul", null, HOW_IT_WORKS.map(t => el("li", null, t))));

const FOOD = /cook|eat|breakfast|meal|snack|lunch|dinner/i;
const FOOD_PLACES = new Set(["coffee_shop", "grocery", "restaurant", "bar"]);

export class FirstMorning {
  constructor(game) { this.game = game; this.state = null; this.keyName = null; this.wasInside = false; }
  reset() { this.state = null; this.keyName = null; this.wasInside = false; }

  key() {
    const g = this.game, boot = document.body.dataset.boot || "live";
    return g.character ? `livera.firstMorning.v1.${boot}.${g.username || ""}.${g.character}` : null;
  }
  load() {
    const k = this.key();
    if (k === this.keyName && this.state) return this.state;
    this.keyName = k;
    let s = null;
    try { s = JSON.parse(store.get(k) || "null"); } catch { s = null; }
    this.state = s && typeof s === "object" && Array.isArray(s.done) ? s : { done: [], skipped: false };
    return this.state;
  }
  save() { if (this.keyName) store.set(this.keyName, JSON.stringify(this.state)); }

  steps() {
    const g = this.game, a = g.agenda, w = g.world, hasJob = !!(w.career && w.career.career);
    const work = a.workplaces()[0];
    const out = [
      { id: "outside", label: "Step outside", show: () => g.ui.ring("ctx-btn") },
      { id: "breakfast", label: "Have breakfast", show: () => g.ui.sheetPlaces({ category: "food" }) },
    ];
    if (hasJob && work) out.push(
      { id: "work", label: `Get to work at ${work.name}`, show: () => g.showPlace(work.id) },
      { id: "shift", label: "Start your shift", show: () => (a.atWork() ? g.ui.sheetScene() : g.showPlace(work.id)) },
      { id: "decision", label: "Make a work call", show: () => g.openPhone("work") });
    out.push({ id: "hello", label: "Say hello to someone", show: () => g.ui.openTalk(true) });
    return out;
  }
  active() { const s = this.load(); return !!(this.keyName && !s.skipped && this.steps().some(x => !s.done.includes(x.id))); }
  mark(id) {
    const s = this.load();
    if (!this.keyName || s.skipped || s.done.includes(id)) return;
    s.done.push(id); this.save();
    const step = this.steps().find(x => x.id === id);
    if (step) this.game.ui.toast(`First morning: ${step.label.replace(/ at .*$/, "")} ✓`);
    this.game.ui.agendaChanged();
  }
  skip() { const s = this.load(); s.skipped = true; this.save(); this.game.ui.agendaChanged(); }

  // From state the client already has, a few times a second.
  tick() {
    if (!this.active()) return;
    const w = this.game.world, s = w.self;
    if (!s) return;
    if (s.inside === "" && this.wasInside) this.mark("outside");
    this.wasInside = this.wasInside || !!s.inside;
    if (!s.inside && !this.wasInside && w.self.pos) this.mark("outside");   // someone who starts outdoors
    if (this.game.agenda.atWork()) this.mark("work");
    if (s.onShift) this.mark("shift");
  }
  // From the server's replies (main.js reports every op that went through).
  onReply(op, args, r) {
    if (!r.ok || !this.active()) return;
    const w = this.game.world, here = w.here;
    if (op === "buy") {
      const o = here && (here.offers || []).find(x => x.id === args.offer);
      if ((o && o.needs && o.needs.hunger > 0) || (here && FOOD_PLACES.has(here.type))) this.mark("breakfast");
    } else if (op === "activity") {
      const a = here && (here.activities || []).find(x => x.id === args.activity);
      if ((a && a.needs && a.needs.hunger > 0) || (a && FOOD.test(`${a.id} ${a.label}`)) || (r.data && r.data.needs && "hunger" in r.data.needs)) this.mark("breakfast");
    } else if (op === "work_answer") this.mark("decision");
    else if (op === "say" || op === "interact") this.mark("hello");
    else if (op === "work" && args.action === "start") this.mark("shift");
  }

  // The row under the Next card: progress and the next step, with Show me.
  strip() {
    if (!this.active()) return null;
    const s = this.load(), steps = this.steps(), next = steps.find(x => !s.done.includes(x.id)), done = steps.filter(x => s.done.includes(x.id)).length;
    return el("div", { class: "morning", id: "first-morning" },
      el("button", { type: "button", class: "morning-open", onclick: () => this.game.ui.sheetToday(), "aria-label": `First morning, ${done} of ${steps.length} done. Next: ${next.label}. Open the checklist` },
        el("span", { class: "eyebrow" }, `First morning · ${done}/${steps.length}`), el("span", { class: "morning-next" }, next.label)),
      el("button", { type: "button", class: "btn small", onclick: () => next.show() }, "Show me"));
  }
  // The checklist in the Today sheet.
  list() {
    if (!this.active()) return [];
    const s = this.load();
    return [
      el("div", { class: "eyebrow" }, "Your first morning"),
      el("ul", { class: "list checklist", id: "first-morning-list" }, this.steps().map(x => {
        const done = s.done.includes(x.id);
        return el("li", { class: done ? "done" : "", dataset: { step: x.id } },
          el("span", { class: "tick", "aria-hidden": "true" }, done ? icon("check") : null),
          el("span", { class: "grow" }, x.label, done ? el("span", { class: "sr-only" }, " (done)") : null),
          done ? null : el("button", { type: "button", class: "btn small", onclick: () => x.show() }, "Show me"));
      })),
      el("p", { class: "source" }, "Ticks itself from what you do. Only this browser keeps it."),
      el("button", { type: "button", class: "btn ghost block", id: "first-morning-skip", onclick: () => { this.skip(); this.game.ui.sheetToday(); } }, "Skip the checklist"),
    ];
  }
}

// Three coach marks, once each per viewer: anchored to a real element, never in the way of a tap
// (they let taps through), gone after a few seconds or on the next tap anywhere.
const MARKS = {
  walk: "Tap the ground to walk; tap a building to look inside.",
  sheet: "Drag the handle down to see more of the map.",
  talk: "Someone spoke. Talk is here: tap it to answer.",
};
export class CoachMarks {
  constructor(ui) { this.ui = ui; this.node = null; this.timer = null; }
  seen(id) { return store.get(`livera.coach.v1.${id}`) === "1"; }
  show(id, anchor) {
    if (this.seen(id) || this.node || !MARKS[id]) return false;
    const a = typeof anchor === "string" ? document.getElementById(anchor) : anchor;
    if (!a && id !== "walk") return false;
    store.set(`livera.coach.v1.${id}`, "1");
    const n = el("div", { class: `coach coach-${id}`, role: "note", id: `coach-${id}` }, el("span", { class: "coach-text" }, MARKS[id]));
    document.getElementById("app").appendChild(n);
    this.node = n;
    this.place(a);
    const done = () => this.hide();
    this.timer = setTimeout(done, 7000);
    setTimeout(() => window.addEventListener("pointerdown", done, { once: true, capture: true }), 400);
    return true;
  }
  place(a) {
    const n = this.node;
    if (!n) return;
    const W = window.innerWidth, H = window.innerHeight, w = Math.min(280, W - 32);
    n.style.width = `${w}px`;
    if (!a) { n.style.left = `${(W - w) / 2}px`; n.style.top = `${Math.round(H * 0.3)}px`; n.classList.add("no-tail"); return; }
    const r = a.getBoundingClientRect(), h = n.offsetHeight || 60;
    const left = Math.max(16, Math.min(W - w - 16, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 14 > 60;
    n.style.left = `${left}px`;
    n.style.top = `${above ? r.top - h - 12 : r.bottom + 12}px`;
    n.style.setProperty("--tail", `${Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left))}px`);
    n.classList.toggle("below", !above);
  }
  hide() { clearTimeout(this.timer); if (this.node) { this.node.remove(); this.node = null; } }
}
