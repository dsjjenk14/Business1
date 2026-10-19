// "Next" and "Today": what to do now, built only from this character's own data, the way the
// server already tells it (spec R1.3). Every line names where it comes from ("From your
// Calendar"); nothing is predicted or invented. Sources, all read-only:
//   look.you (needs, on shift, inside), look.here (what this place offers and does, with its need
//   effects when the server sends them), phone calendar (routine and bills), phone career
//   (workplaces), phone work (decisions waiting), phone property (where you live), map (places and
//   their opening hours), phone goals (today's goals, on servers that have them).
// Rules for the Next card, first match wins: a need below 20; at your workplace and off shift,
// "Start your shift"; on shift with decisions waiting; the next routine entry within three hours
// (with Go when it names a real place); a bill due within three game days; your workplace.

import { el, money, titleCase } from "./dom.js";
import { icon, kindIcon } from "./icons.js";
import { dist } from "./state.js";
import { openingText } from "./messages.js";
import { stamp } from "./render2d.js";

const NEED_PLACES = { hunger: "food", social: "fun", recreation: "fun", health: "health", dental: "health", grooming: "shops" };
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NEED_FIX = {
  bladder: "find a bathroom", hunger: "eat something", energy: "rest", hygiene: "wash", social: "see people",
  recreation: "do something fun", comfort: "sit somewhere comfortable", health: "see a doctor", dental: "brush your teeth", grooming: "freshen up",
};
export const needFixText = k => NEED_FIX[k] || `look after your ${titleCase(k).toLowerCase()}`;
const hm = m => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const norm = s => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

// A routine entry or a workplace names a place by its name: an exact match only (a building's name
// or a place's, ignoring a trailing "(private)"), so Go never guesses.
export function placeByName(world, text) {
  const t = norm(text), bare = norm(String(text || "").replace(/\s*\([^)]*\)\s*$/, ""));
  if (!t) return null;
  for (const want of [t, bare]) {
    const p = world.places.find(x => norm(x.name) === want);
    if (p) return p;
    const b = world.buildings.find(x => norm(x.name) === want);
    if (b) return world.placeById.get(b.id) || { ...b, units: b.units };
  }
  return null;
}

// Today's routine from the Calendar app: entries for today's weekday, the weekday / weekend list
// and any every-day list, sorted by time. Each: {time, minute (absolute), activity}.
export function routineFor(routine, minute) {
  if (!routine || typeof routine !== "object" || minute === null) return [];
  const day = Math.floor(minute / 1440), wd = day % 7, start = day * 1440;
  const keys = [DAY_KEYS[wd], wd < 5 ? "weekdays" : "weekends", "daily", "every_day", "everyday"];
  const out = [];
  for (const k of keys) for (const e of Array.isArray(routine[k]) ? routine[k] : []) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(e && e.time || ""));
    if (!m || !e.activity) continue;
    out.push({ time: `${m[1].padStart(2, "0")}:${m[2]}`, minute: start + Number(m[1]) * 60 + Number(m[2]), activity: String(e.activity) });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

export class Agenda {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.calendar = null; this.work = null; this.goals = null; this.home = null;   // the phone apps' answers
    this.helps = new Map();     // place id -> {need: amount}: what a place you've been in does, as the server said
    this.last = { calendar: 0, work: 0, property: 0, goals: 0 };
    this.goalsMissing = false;
    this.hour = null;
  }
  reset() { this.calendar = this.work = this.goals = this.home = null; this.last = { calendar: 0, work: 0, property: 0, goals: 0 }; this.hour = null; }

  // Called from the game's tick: the calendar once a game hour (and on play), work every 20 s on
  // shift (decisions come up through the shift), where you live once.
  tick(now) {
    const w = this.world, m = w.minute(now);
    const hour = m === null ? null : Math.floor(m / 60);
    if (hour !== this.hour || now - this.last.calendar > 120000) { this.hour = hour; this.refresh("calendar"); if (!this.goalsMissing) this.refresh("goals"); }
    if (w.career && w.career.career && now - this.last.work > (w.self && w.self.onShift ? 20000 : 90000)) this.refresh("work");
    if (!this.home && now - this.last.property > 60000) this.refresh("property");
  }
  async refresh(app) {
    const key = app === "property" ? "property" : app;
    this.last[key] = performance.now();
    const r = await this.game.phone(app);
    if (!r.ok) { if (app === "goals" && r.error.code === "unknown_app") this.goalsMissing = true; return; }
    if (app === "calendar") this.calendar = r.data;
    else if (app === "work") this.work = r.data;
    else if (app === "goals") this.goals = r.data;
    else if (app === "property") {
      const mine = (r.data.properties || []).find(p => p && p.lives_here) || null;
      this.home = mine ? { id: mine.location, name: mine.name } : { id: null };
    }
    this.game.ui.agendaChanged();
  }
  // What the place you're in does to needs: public content, kept for this session so a later
  // warning can point back at it.
  learnHere(here) {
    if (!here || !here.id) return;
    const helps = {};
    for (const x of [...(here.activities || []), ...(here.offers || [])]) {
      if (!x || !x.needs || typeof x.needs !== "object") continue;
      for (const [k, v] of Object.entries(x.needs)) if (typeof v === "number" && v > 0) helps[k] = Math.max(helps[k] || 0, v);
    }
    if (Object.keys(helps).length) this.helps.set(here.id, helps);
  }

  homeId() { return this.home && this.home.id ? this.home.id : null; }
  workplaces() {
    const c = this.world.career;
    return (c && Array.isArray(c.workplaces) ? c.workplaces : []).map(n => placeByName(this.world, n)).filter(Boolean);
  }
  atWork() { const s = this.world.self; return !!(s && s.inside && this.workplaces().some(p => p.id === s.inside)); }

  routine(minute = this.world.minute()) { return routineFor(this.calendar && this.calendar.routine, minute); }

  distanceText(p) {
    const w = this.world, me = w.selfPos();
    if (!p || !me || !p.door) return "";
    if (w.self.inside === p.id) return "You're here";
    const d = dist(me, p.door), s = d / (w.rules.walk_speed_mps || 6);
    return `${Math.round(d)} m · about ${s < 60 ? `${Math.max(5, Math.round(s / 5) * 5)} s` : `${Math.round(s / 60)} min`} on foot`;
  }

  // The best fix for a low need: something here that helps (its effect as the server says), else
  // the nearest open place you've been in that does.
  fixFor(need) {
    const w = this.world, here = w.here, m = w.minute();
    if (here) {
      const act = (here.activities || []).find(a => a.needs && a.needs[need] > 0 && !(a.ready_in_minutes > 0));
      if (act) return { here: true, label: act.label, run: () => this.game.activity(act) };
      const offer = (here.offers || []).find(o => o.needs && o.needs[need] > 0);
      if (offer) return { here: true, label: `Buy ${offer.label}`, run: () => this.game.buy(offer, this.game.ui.payMethod) };
    }
    const me = w.selfPos();
    let best = null;
    for (const [id, helps] of this.helps) {
      if (!(helps[need] > 0) || (here && here.id === id)) continue;
      const p = w.placeById.get(id);
      if (!p || !me) continue;
      const o = openingText(p, m);
      if ((o && !o.open) || p.status === "closed") continue;
      const d = dist(me, p.door);
      if (!best || d < best.d) best = { d, p };
    }
    return best ? { place: best.p, label: best.p.name } : null;
  }

  // The Next card's one item, or null.
  next() {
    const w = this.world, s = w.self, m = w.minute();
    if (!s || m === null) return null;
    const goTo = p => ({ label: "Go", icon: "go", run: () => this.game.goTo(p.id) });
    // 1. A need running out.
    const low = Object.entries(s.needs || {}).filter(([, v]) => typeof v === "number" && v < 20).sort((a, b) => a[1] - b[1])[0];
    if (low) {
      const [k, v] = low, fix = this.fixFor(k);
      return { kind: "need", need: k, eyebrow: `${titleCase(k)} ${Math.round(v)} · ${v < 10 ? "now" : "soon"}`, urgent: v < 10,
        title: fix && fix.here ? `${fix.label} here` : fix && fix.place ? `${titleCase(needFixText(k))}: ${fix.place.name}` : titleCase(needFixText(k)),
        detail: fix && fix.place ? this.distanceText(fix.place) : fix ? "" : "Open Places to find somewhere",
        target: fix && fix.place ? fix.place.id : null, source: "From your needs",
        action: fix && fix.here ? { label: "Do it", icon: "check", run: fix.run } : fix && fix.place ? goTo(fix.place) : { label: "Places", icon: "places", run: () => this.game.ui.sheetPlaces({ category: NEED_PLACES[k] }) } };
    }
    const career = w.career && w.career.career ? w.career : null;
    // 2. At work, off shift.
    if (career && !s.onShift && this.atWork()) {
      return { kind: "shift", eyebrow: `Work · ${career.title || career.career}`, title: "Start your shift", detail: `${money(career.hourly_cents)}/hr · paid when you end it`,
        source: "From your Career", action: { label: "Start", icon: "go", run: () => this.game.work("start") } };
    }
    // 3. On shift, decisions waiting.
    const open = this.work && Number(this.work.open) > 0 ? Number(this.work.open) : 0;
    if (s.onShift && open) {
      return { kind: "decisions", eyebrow: "Work · on shift", title: `${open} work decision${open > 1 ? "s" : ""} waiting`, detail: "Good calls count toward your promotion",
        source: "From your Work app", action: { label: "Open", icon: "workdesk", run: () => this.game.openPhone("work") } };
    }
    // 4. The routine: the entry under way (if you're not there yet) or the next one within 3 hours.
    const workIds = new Set(this.workplaces().map(p => p.id));
    const entries = this.routine(m);
    for (const e of entries) {
      const place = placeByName(w, e.activity), started = m - e.minute;
      if (started > 0 && (started > 120 || !place || s.inside === place.id || (workIds.has(place.id) && s.onShift))) continue;
      if (started <= 0 && -started > 180) break;
      if (place && s.inside === place.id) continue;
      const isWork = place && workIds.has(place.id);
      if (isWork && s.onShift) continue;
      return { kind: "routine", eyebrow: `${started > 0 ? `Now · since ${e.time}` : `Next · ${e.time}`}${isWork ? " · Work" : ""}`, title: place ? place.name : e.activity,
        detail: [isWork && career ? `${career.title} · ${money(career.hourly_cents)}/hr` : place && place.name !== e.activity ? e.activity : "", place ? this.distanceText(place) : ""].filter(Boolean).join(" · "),
        target: place ? place.id : null, source: "From your Calendar", action: place ? goTo(place) : null };
    }
    // 5. A bill due within three game days.
    for (const u of (this.calendar && Array.isArray(this.calendar.upcoming) ? this.calendar.upcoming : [])) {
      if (!u || typeof u.at !== "number" || u.at - m > 3 * 1440 || u.at < m) continue;
      return { kind: "bill", eyebrow: `Due ${stamp(u.at).slice(0, 3)} · ${hm(u.at)}`, title: String(u.title || "A bill"), detail: "Paid from your bank account",
        source: "From your Calendar", action: { label: "Bank", icon: "bank", run: () => this.game.openPhone("bank") } };
    }
    // 6. Your workplace, when nothing else is due.
    if (career && !s.onShift) {
      const p = this.workplaces()[0];
      if (p) return { kind: "work", eyebrow: `Work · ${career.title}`, title: p.name, detail: [this.distanceText(p), "start a shift when you get there"].filter(Boolean).join(" · "),
        target: p.id, source: "From your Career", action: goTo(p) };
    }
    return null;
  }

  // ------------------------------------------------------------------ rendering
  // The Today sheet: the day's routine, what's due, work, today's goals (when the server has them).
  todayBody() {
    const w = this.world, m = w.minute(), out = [];
    const entries = this.routine(m);
    out.push(el("div", { class: "eyebrow" }, `Today · ${m === null ? "" : stamp(m).slice(0, 3)}`));
    if (!this.calendar) out.push(el("p", { class: "hint" }, "Opening your Calendar…"));
    else if (!entries.length) out.push(el("p", { class: "hint" }, "Nothing in your routine today."));
    else out.push(el("ul", { class: "list agenda" }, entries.map(e => {
      const place = placeByName(w, e.activity), past = m !== null && e.minute + 60 < m;
      return el("li", { class: past ? "past" : "" },
        el("div", { class: "agenda-row" }, el("span", { class: "time" }, e.time),
          el("span", { class: "grow" }, place ? place.name : e.activity, place && place.name !== e.activity ? el("span", { class: "hint" }, ` · ${e.activity}`) : null),
          place && !past && w.self.inside !== place.id ? el("button", { type: "button", class: "btn small", onclick: () => this.game.goTo(place.id) }, icon("go"), "Go") : null));
    })));
    out.push(el("p", { class: "source" }, "From your Calendar"));
    const bills = (this.calendar && this.calendar.upcoming) || [];
    if (bills.length) {
      out.push(el("div", { class: "eyebrow" }, "Coming up"));
      out.push(el("ul", { class: "list" }, bills.map(u => el("li", null, el("div", { class: "offer-head" }, el("span", null, String(u.title || "")), el("span", { class: "hint" }, String(u.when || "")))))));
    }
    const c = w.career && w.career.career ? w.career : null;
    if (c) {
      out.push(el("div", { class: "eyebrow" }, `Work · ${c.title}`));
      const wp = this.workplaces()[0];
      const lines = [
        `${w.self.onShift ? "On shift now" : "Off shift"}${wp ? ` · ${wp.name}` : ""}`,
        this.work && typeof this.work.answered_today === "number" ? `Decisions today: ${this.work.answered_today} answered${this.work.open ? `, ${this.work.open} waiting` : ""}${this.work.upcoming ? `, ${this.work.upcoming} still to come` : ""}` : "",
        typeof c.hours_at_level === "number" && c.hours_to_promote ? `Toward promotion: ${c.hours_at_level} of ${c.hours_to_promote} hours` : "",
      ].filter(Boolean);
      for (const l of lines) out.push(el("p", { class: "hint" }, l));
      out.push(el("p", { class: "source" }, "From your Career and Work apps"));
    }
    const g = this.goals && Array.isArray(this.goals.today) ? this.goals.today : null;
    if (g && g.length) {
      out.push(el("div", { class: "eyebrow" }, "Today's goals"));
      out.push(el("ul", { class: "list checklist" }, g.map(x => el("li", { class: x.done ? "done" : "" },
        el("span", { class: "tick", "aria-hidden": "true" }, x.done ? icon("check") : null), el("span", null, String(x.label || ""), x.done ? el("span", { class: "sr-only" }, " (done)") : null)))));
      out.push(el("p", { class: "source" }, "From your Goals app"));
    }
    return out;
  }

  // The Next card's content for an item (the caller owns the container).
  card(item) {
    if (!item) return null;
    const a = item.action;
    return [
      el("div", { class: "next-text grow" },
        el("div", { class: `eyebrow${item.urgent ? " urgent" : ""}` }, item.eyebrow),
        el("div", { class: "next-title" }, item.target ? icon(kindIcon((this.world.placeById.get(item.target) || {}).type)) : null, el("span", null, item.title)),
        item.detail ? el("div", { class: "next-detail" }, item.detail) : null,
        el("div", { class: "source" }, item.source)),
      a ? el("button", { type: "button", class: "btn primary next-go", id: "next-go", "aria-label": `${a.label}: ${item.title}`, onclick: () => a.run() }, icon(a.icon || "go"), a.label) : null,
    ];
  }
}
