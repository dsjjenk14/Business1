// The live world model on the client: what this character can see and know, as the server
// last said, plus straight-line prediction in between. Nothing here decides anything: every
// position comes from the server (`look`, the `people` stream, `arrived`, move replies), and
// prediction only fills the frames between two server updates (a walker with an unchanged
// target moves in a straight line at the speed the server reported).

import { buildingsFrom } from "./layout.js";

// Used only until the server's own `rules` arrive (older servers don't send them); the values
// match data/config/simulation.json at the time of writing.
export const DEFAULT_RULES = {
  whisper_range_m: 2, say_range_m: 20, shout_range_m: 60, sight_range_m: 120, walk_speed_mps: 6,
  minutes_per_real_second: 1, entry_radius_m: 5, boarding_radius_m: 15,
};

const BUBBLE_MS = 6000;

const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
const vec = v => (Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1]) ? [Number(v[0]), Number(v[1])] : null);
export const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity);

export function predict(e, now) {
  if (!e || !e.pos) return null;
  if (!e.target || !(e.speed > 0)) return e.pos;
  const dx = e.target[0] - e.pos[0], dy = e.target[1] - e.pos[1], d = Math.hypot(dx, dy);
  const travel = e.speed * Math.max(0, now - e.at) / 1000;
  if (travel >= d || d < 1e-6) return e.target;
  return [e.pos[0] + dx / d * travel, e.pos[1] + dy / d * travel];
}
export const arrived = (e, now) => !e || !e.target || dist(predict(e, now), e.target) < 0.05;

export class World {
  constructor() {
    this.rules = { ...DEFAULT_RULES };
    this.rulesFromServer = false;
    this.places = []; this.placeById = new Map(); this.buildings = []; this.buildingById = new Map(); this.buildingOfPlace = new Map();
    this.bounds = { min: [0, 0], max: [1000, 800] };
    this.transit = null; this.transitFromServer = false;
    this.interactions = null;
    this.projects = new Map();
    this.selfId = null; this.selfName = "";
    this.self = null;
    this.people = new Map();
    this.time = null;
    this.weather = null;
    this.money = null;
    this.here = null;
    this.nearby = [];
    this.bubbles = [];
    this.streaming = false;      // has the server sent a `people` event? (newer protocol)
    this.positionsInLook = false;
    this.career = null;
    this.school = null;          // the school app's answer: enrolled program, programs and campuses
    this.names = new Map();      // id -> name, from everything we've been told
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(topic) { for (const fn of this.listeners) { try { fn(topic); } catch (e) { console.warn("change listener failed", e); } } }

  setRules(r) {
    if (!r || typeof r !== "object") return;
    for (const k of Object.keys(DEFAULT_RULES)) if (typeof r[k] === "number" && isFinite(r[k])) this.rules[k] = r[k];
    // What each need does at 0, and when you can go to bed or nap (D-080): read as the server says them.
    for (const k of ["needs_at_zero", "sleep"]) if (r[k] && typeof r[k] === "object") this.rules[k] = r[k];
    this.rulesFromServer = true;
    this.changed("rules");
  }

  setMap(m) {
    if (!m) return;
    if (m.rules) this.setRules(m.rules);
    if (m.bounds && vec(m.bounds.min) && vec(m.bounds.max)) this.bounds = { min: vec(m.bounds.min), max: vec(m.bounds.max) };
    this.places = (Array.isArray(m.places) ? m.places : []).filter(p => p && typeof p.id === "string" && vec(p.door))
      .map(p => ({ ...p, door: vec(p.door), name: String(p.name ?? p.id) }));
    this.placeById = new Map(this.places.map(p => [p.id, p]));
    this.buildings = buildingsFrom(this.places);
    this.buildingById = new Map(this.buildings.map(b => [b.id, b]));
    this.buildingOfPlace = new Map();
    for (const b of this.buildings) for (const u of b.units || [{ id: b.id }]) this.buildingOfPlace.set(u.id, b);
    if (m.transit && Array.isArray(m.transit.lines)) { this.setTransit(m.transit.lines); this.transitFromServer = true; }
    if (Array.isArray(m.interactions)) this.interactions = m.interactions.filter(i => i && typeof i.id === "string");
    this.changed("map");
  }

  // map.transit (newer servers) or the transit phone app (older ones: no speed, hours as [a, b]).
  setTransit(lines) {
    this.transit = lines.filter(l => l && Array.isArray(l.stops)).map(l => ({
      id: String(l.id), name: String(l.name ?? l.id), fare_cents: num(l.fare_cents, 0), speed_mps: num(l.speed_mps, null),
      first_hour: num(l.first_hour, Array.isArray(l.hours) ? l.hours[0] : null), last_hour: num(l.last_hour, Array.isArray(l.hours) ? l.hours[1] : null),
      stops: l.stops.filter(s => s && vec(s.at)).map(s => ({ id: String(s.id), name: String(s.name ?? s.id), at: vec(s.at), line: String(l.id) })),
    }));
    this.changed("map");
  }
  allStops() { return (this.transit || []).flatMap(l => l.stops); }
  stopById(id) { return this.allStops().find(s => s.id === id) || null; }
  lineOfStop(id) { return (this.transit || []).find(l => l.stops.some(s => s.id === id)) || null; }

  setProjects(list) {
    this.projects = new Map((list || []).filter(p => p && p.id).map(p => [p.id, p]));
    this.changed("map");
  }

  // ------------------------------------------------------------------ time
  minute(now = performance.now()) {
    if (!this.time) return null;
    return this.time.minute + Math.max(0, now - this.time.at) / 1000 * this.rules.minutes_per_real_second;
  }

  // ------------------------------------------------------------------ look (the full snapshot)
  applyLook(look, now = performance.now()) {
    if (!look || typeof look !== "object") return;
    if (look.time && typeof look.time.minute === "number") {
      // The server sends whole minutes; don't let the clock tick backwards within the minute.
      const pred = this.minute(now), m = look.time.minute;
      const keep = pred !== null && m <= pred && pred - m < 1.5;
      this.time = { ...look.time, minute: keep ? pred : m, at: now };
    }
    const you = look.you;
    if (you && typeof you === "object") {
      this.selfId = you.id || this.selfId;
      this.selfName = you.name || this.selfName;
      if (this.selfId) this.names.set(this.selfId, this.selfName);
      const s = this.self || (this.self = { id: this.selfId, kind: "self" });
      s.id = this.selfId; s.name = this.selfName;
      s.needs = you.needs || s.needs || {};
      s.emotions = you.emotions || s.emotions || {};
      s.onShift = !!you.on_shift;
      s.asleep = !!you.asleep;
      s.inside = typeof you.inside === "string" ? you.inside : "";
      const pos = vec(you.position);
      if ("target" in you || "speed_mps" in you) {
        // Newer servers say exactly how we're moving.
        this.setMotion(s, { position: pos, target: you.target, speed_mps: you.speed_mps, mode: you.mode, moving: you.moving }, now);
      } else if (pos) {
        // Older servers: position and a moving flag; the target is what our move reply said.
        s.pos = pos; s.at = now;
        if (!you.moving) { s.target = null; s.speed = 0; s.mode = "walk"; }
        else if (!s.target) s.speed = 0;
      }
    }
    if (Array.isArray(look.people)) {
      const seen = new Set();
      for (const p of look.people) {
        if (!p || typeof p.id !== "string") continue;
        seen.add(p.id);
        const e = this.people.get(p.id) || { id: p.id, kind: "person" };
        e.name = String(p.name ?? p.id); e.known = !!p.known; e.distance = num(p.distance_m, null);
        if ("scripted" in p) e.scripted = !!p.scripted;
        this.names.set(p.id, e.name);
        if (vec(p.position)) {
          this.positionsInLook = true;
          e.inside = typeof p.inside === "string" ? p.inside : "";
          this.setMotion(e, { position: p.position, target: p.target, speed_mps: p.speed_mps, mode: p.mode, moving: p.moving }, now);
        } else {
          // Older servers don't say where people are: they're listed, not drawn.
          e.pos = null; e.inside = s_inside(this);
        }
        this.people.set(p.id, e);
      }
      for (const id of [...this.people.keys()]) if (!seen.has(id)) this.people.delete(id);
    }
    if ("here" in look) this.here = look.here && look.here.id ? look.here : null;
    if (Array.isArray(look.nearby)) this.nearby = look.nearby;
    this.changed("look");
  }

  setMotion(e, m, now) {
    const pos = vec(m.position);
    if (pos) { e.pos = pos; e.at = now; }
    const target = vec(m.target);
    e.target = target;
    e.speed = target ? num(m.speed_mps, this.rules.walk_speed_mps) : 0;
    if (target && !(e.speed > 0)) e.speed = this.rules.walk_speed_mps;
    e.mode = m.mode === "bus" ? "bus" : "walk";
  }

  // ------------------------------------------------------------------ the `people` stream
  applyPeople(changes, now = performance.now()) {
    if (!Array.isArray(changes)) return;
    this.streaming = true;
    for (const c of changes) {
      if (!c || typeof c.character !== "string") continue;
      if (c.self || c.character === this.selfId) {
        if (!this.self) continue;
        if (c.state === "gone") continue;  // never sent for yourself; ignore if it were
        if (typeof c.inside === "string") this.self.inside = c.inside;
        this.setMotion(this.self, c, now);
        continue;
      }
      if (c.state === "gone") { this.people.delete(c.character); continue; }
      const e = this.people.get(c.character) || { id: c.character, kind: "person" };
      if (c.name) { e.name = String(c.name); this.names.set(c.character, e.name); }
      if (!e.name) e.name = this.names.get(c.character) || c.character;
      if ("known" in c) e.known = !!c.known;
      if ("scripted" in c) e.scripted = !!c.scripted;
      e.inside = typeof c.inside === "string" ? c.inside : "";
      this.setMotion(e, c, now);
      this.people.set(c.character, e);
    }
    this.changed("people");
  }

  // Our own move started (move reply): predict right away; the server corrects us if needed.
  selfMoving(target, speed, mode, now = performance.now()) {
    if (!this.self) return;
    const cur = predict(this.self, now) || this.self.pos;
    this.self.pos = cur; this.self.at = now;
    this.self.target = vec(target);
    this.self.speed = this.self.target ? num(speed, this.rules.walk_speed_mps) : 0;
    this.self.mode = mode || "walk";
    this.changed("self");
  }
  selfArrived(pos, now = performance.now()) {
    if (!this.self) return;
    const p = vec(pos);
    if (p) this.self.pos = p;
    this.self.at = now; this.self.target = null; this.self.speed = 0; this.self.mode = "walk";
    this.changed("self");
  }

  // ------------------------------------------------------------------ queries
  selfPos(now = performance.now()) { return this.self ? predict(this.self, now) : null; }
  personPos(id, now = performance.now()) { return id === this.selfId ? this.selfPos(now) : predict(this.people.get(id), now); }
  nameOf(id) { return id === this.selfId ? this.selfName : (this.people.get(id)?.name || this.names.get(id) || id); }

  // Distance to someone as well as we know it: predicted positions, or the distance the last
  // `look` reported (older servers), or 0 when you're in the same building.
  distanceTo(id, now = performance.now()) {
    const p = this.people.get(id);
    if (!p || !this.self) return Infinity;
    if (this.self.inside) return p.inside === this.self.inside || (!p.pos && s_inside(this)) ? 0 : Infinity;
    if (p.inside) return Infinity;
    if (p.pos) return dist(this.selfPos(now), predict(p, now));
    return p.distance ?? Infinity;
  }

  // Who would hear you at this range. Indoors the server lets everyone in the building hear.
  peopleWithin(range, now = performance.now()) {
    const out = [];
    for (const p of this.people.values()) if (this.distanceTo(p.id, now) <= range + 1e-6) out.push(p);
    return out;
  }

  rangeFor(volume) {
    return volume === "whisper" ? this.rules.whisper_range_m : volume === "shout" ? this.rules.shout_range_m : this.rules.say_range_m;
  }

  addBubble(b, now = performance.now()) {
    this.bubbles.push({ ...b, at: now, until: now + (b.ms || BUBBLE_MS) });
    if (this.bubbles.length > 30) this.bubbles.splice(0, this.bubbles.length - 30);
    this.changed("bubble");
  }
  liveBubbles(now = performance.now()) {
    this.bubbles = this.bubbles.filter(b => b.until > now);
    return this.bubbles;
  }
}

function s_inside(w) { return w.self && w.self.inside ? w.self.inside : ""; }
