// Rooms you walk around in (D-066). Inside a place whose room the server describes (`look.here.room`) and whose
// picture this client has (rooms/manifest.json, made by scripts/client_rooms.py), the town gives way to the room:
// the owner's cutaway picture fitted to the screen, lit by the game clock like the map, with everyone inside drawn
// where the server says they are. Tap the floor to walk there, a seat to sit, the counter to buy, the stage to
// perform, a door to leave or to do what it's for; the map button shows the town without leaving. Every move is one
// op (move_inside, sit, stand) and the server's answer is what's drawn: the client only animates the walk between
// two points the server already set. Places without a room keep the scene card.

import { el, firstName } from "./dom.js";
import { icon } from "./icons.js";
import { LIGHT } from "./layout.js";
import { drawFigure, seatHeight, seatTune } from "./figures.js";

const SEATS = new Set(["seat", "sofa", "bed", "stool"]);
// Where you sit: a seat you chose, or the bench of the cell an arrest put you in (nobody takes a cell by choice).
const SITS = new Set([...SEATS, "cell"]);
const ISO = { n: [-1, -0.5], e: [1, -0.5], s: [1, 0.5], w: [-1, 0.5] };
// How a facing in the picture is drawn (figures.js: mirror = facing screen-left): s and w face the viewer,
// n and e face away; w and n look to the left of the screen.
const FACING = { w: { facing: "front34", mirror: true }, s: { facing: "front34", mirror: false },
                 n: { facing: "back34", mirror: true }, e: { facing: "back34", mirror: false } };
const WALK_MPS = 2.2;            // drawn walking speed in the room (the server has already moved you)
const clamp01 = v => Math.max(0, Math.min(1, v));
const vec = v => (Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1]) ? [Number(v[0]), Number(v[1])] : null);

// ------------------------------------------------------------------ the client copies of the pictures
const rooms = new Map();
let manifestLoad = null;
export function loadRoomManifest() {
  if (!manifestLoad) manifestLoad = (async () => {
    try {
      const r = await fetch("rooms/manifest.json", { cache: "no-cache" });
      if (!r.ok) return;
      const m = await r.json();
      for (const [id, e] of Object.entries(m && typeof m === "object" ? m : {})) {
        if (!/^[a-z0-9_]+$/.test(id) || !e || !vec(e.size) || !vec(e.offset) || !(e.scale > 0)) continue;
        rooms.set(id, Object.freeze({ size: vec(e.size), offset: vec(e.offset), scale: Number(e.scale) }));
      }
    } catch { /* no rooms: every place keeps the scene card */ }
  })();
  return manifestLoad;
}

// The owner's picture of a place's room, once the manifest has loaded (the social app's post pictures, D-074).
export const roomUrl = id => (rooms.has(id) ? `rooms/${encodeURIComponent(id)}.webp` : null);

// ------------------------------------------------------------------ light, as the map has it (LIGHT in layout.js)
const hex = h => h.match(/\w\w/g).map(x => parseInt(x, 16));
function lightAt(m) {
  const h = (((m % 1440) + 1440) % 1440) / 60;
  let i = 0;
  while (i < LIGHT.length - 2 && LIGHT[i + 1][0] <= h) i++;
  const a = LIGHT[i], b = LIGHT[i + 1], k = b[0] > a[0] ? clamp01((h - a[0]) / (b[0] - a[0])) : 0, t = k * k * (3 - 2 * k);
  const amb = hex(a[4]).map((v, j) => Math.round(v + (hex(b[4])[j] - v) * t));
  return { amb, amt: a[5] + (b[5] - a[5]) * t, gold: a[6] + (b[6] - a[6]) * t };
}
function daylight(m) {
  const h = (((m % 1440) + 1440) % 1440) / 60;
  if (h < 5 || h >= 20) return 0; if (h < 7) return (h - 5) / 2; if (h < 18) return 1; return 1 - (h - 18) / 2;
}

// ------------------------------------------------------------------ geometry
function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
// Whether furniture stands in front of a point: a footprint below it on the picture (nearer the viewer).
function inFront(poly, p) {
  if (inPoly(p, poly)) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((xi > p[0]) === (xj > p[0])) continue;
    const y = yi + (yj - yi) * (p[0] - xi) / (xj - xi);
    if (y > p[1]) return true;
  }
  return false;
}
// The part of the picture a piece of furniture covers: its footprint raised by its height (a convex hull).
function hull(points) {
  const pts = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function facingOf(dx, dy) { return dy < 0 ? (dx < 0 ? "n" : "e") : (dx < 0 ? "w" : "s"); }

// ------------------------------------------------------------------ the room view
export class RoomView {
  constructor(game) {
    this.game = game;
    this.attached = false;
    this.room = null;          // the interior as the server describes it
    this.placeId = null;       // the place it's the inside of
    this.people = new Map();   // id -> {at, spot, from, to, t0, dur, facing, pose}
    this.mapMode = false;      // the town shown without leaving
    this.view = null;          // {s, ox, oy}: screen = picture * s + o
    this.userView = false;     // the player panned or zoomed
    this.pic = null;           // {img, lights, baked, key, entry}
    this.label = null;         // {text, at, until}
    this.hover = null;
    this.hits = [];
    this.drawn = new Map();    // id -> how drawFigure drew them last frame ({pose, frame, mode}), for the tests
    this.pulse = null;         // {id, until}: the spot a tray chip was just tapped for
    // Attach once the game has built its transport, renderer and UI (the constructor that holds this hasn't yet).
    const tryAttach = () => { if (game.transport && game.renderer && game.ui && game.world) this.attach(); else setTimeout(tryAttach, 30); };
    queueMicrotask(tryAttach);
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    const g = this.game, app = document.getElementById("app"), town = document.getElementById("town");
    if (!document.querySelector('link[data-room-css]')) document.head.appendChild(el("link", { rel: "stylesheet", href: "css/room.css", dataset: { roomCss: "1" } }));
    this.canvas = el("canvas", { id: "room", hidden: true, "aria-label": "The room you're in. Tap the floor to walk, a seat to sit down, the counter to buy, a door to leave." });
    town.after(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.toggle = el("button", { type: "button", class: "room-toggle", id: "room-toggle", hidden: true, onclick: () => this.setMapMode(!this.mapMode) });
    this.standBtn = el("button", { type: "button", class: "room-stand", id: "room-stand", hidden: true, onclick: () => this.stand() }, "Stand up");
    this.tag = el("div", { class: "room-tag", id: "room-tag", hidden: true, "aria-hidden": "true" });
    app.append(this.toggle, this.standBtn, this.tag);
    g.transport.on("event", m => { if (m && m.event === "room" && m.data) this.onRoomEvent(m.data); });
    g.world.onChange(topic => { if (topic === "look") this.fromLook(); });
    // While the room covers the town, the town isn't drawn.
    const frame = g.renderer.frame.bind(g.renderer);
    g.renderer.frame = now => { if (!this.covering()) frame(now); };
    this.attachInput();
    loadRoomManifest().then(() => this.fromLook());
    const loop = now => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    window.addEventListener("resize", () => { if (!this.userView) this.view = null; });
    // For the end-to-end tests: where things are on screen, read-only.
    window.__liveraRoom = Object.freeze({
      active: () => this.covering(), interior: () => (this.room ? this.room.id : null), mapMode: () => this.mapMode,
      spotPoint: id => this.spotScreen(id), floorPoint: (x, y) => this.toScreen([x, y]), personPoint: id => this.personScreen(id),
      people: () => [...this.people.entries()].map(([id, p]) => ({ id, at: p.at.slice(), spot: p.spot })),
      // How each person was drawn last frame: the pose, and for a sprite sheet the frame and its anchor (D-072).
      drawn: id => { const d = this.drawn.get(id); return d ? { ...d, box: d.box.slice() } : null; },
      label: () => (this.label ? this.label.text : null),
      view: () => (this.view ? { s: this.view.s, ox: this.view.ox, oy: this.view.oy } : null),
      hitAt: (x, y) => { const h = this.hitAt(x, y); return h ? { kind: h.kind, id: h.id || (h.spot && h.spot.id) || null } : null; },
      // Pans the view (only the view) so a room point is in the middle, as a drag would.
      centerOn: (x, y) => { if (!this.view) return false; const r = this.canvas.getBoundingClientRect(); this.userView = true; this.view = { ...this.view, ox: r.width / 2 - x * this.view.s, oy: r.height / 2 - y * this.view.s, auto: false }; return true; },
    });
  }

  // ------------------------------------------------------------------ state from the server
  // look.here.room: the room itself and everyone in it, as a snapshot.
  fromLook() {
    const w = this.game.world, here = w.here, room = here && here.room;
    const inside = w.self && w.self.inside;
    if (!inside) { this.clear(); return; }
    if (!here || here.id !== inside) return;  // the look hasn't caught up with the door yet
    if (!room || !room.interior || !Array.isArray(room.interior.size)) { this.clear(); return; }
    if (!this.room || this.room.id !== room.interior.id || this.placeId !== here.id) this.setRoom(room.interior, here.id);
    else this.room = room.interior;
    const seen = new Set();
    for (const p of Array.isArray(room.people) ? room.people : []) {
      if (!p || typeof p.id !== "string") continue;
      seen.add(p.id);
      this.place(p.id, vec(p.at), typeof p.spot === "string" ? p.spot : null);
    }
    for (const id of [...this.people.keys()]) if (!seen.has(id)) this.people.delete(id);
  }
  // The `room` event: who arrived, moved, sat, stood up or left, once a tick.
  onRoomEvent(d) {
    const w = this.game.world;
    if (!w.self || d.place !== w.self.inside || !this.room || d.interior !== this.room.id) return;
    for (const c of Array.isArray(d.changes) ? d.changes : []) {
      if (!c || typeof c.character !== "string") continue;
      if (c.state === "gone") this.people.delete(c.character);
      else this.place(c.character, vec(c.at), typeof c.spot === "string" ? c.spot : null);
    }
  }
  setRoom(interior, placeId) {
    const fresh = this.placeId !== placeId;
    this.room = interior; this.placeId = placeId; this.people.clear();
    if (fresh) { this.mapMode = false; this.userView = false; this.view = null; this.pulse = null; }
    this.loadPicture(interior.id);
  }
  clear() {
    if (!this.room) return;
    this.room = null; this.placeId = null; this.people.clear(); this.mapMode = false; this.label = null;
  }
  // Someone is at `at` (holding `spot`): walk them there from where they're drawn.
  place(id, at, spot, now = performance.now()) {
    if (!at) return;
    const p = this.people.get(id);
    if (!p) {
      const s = spot && this.spot(spot);
      this.people.set(id, { at, spot, from: at, to: at, t0: now, dur: 0, facing: s ? s.facing : (this.room.entrance && this.room.entrance.facing) || "e", phase: 0 });
      return;
    }
    p.spot = spot;
    if (p.to[0] === at[0] && p.to[1] === at[1]) return;
    const cur = this.drawnAt(p, now), d = Math.hypot(at[0] - cur[0], at[1] - cur[1]);
    const speed = (this.room.person_px || 120) / 1.75 * WALK_MPS;
    p.from = cur; p.to = at; p.at = at; p.t0 = now; p.dur = Math.min(3000, d / speed * 1000);
    if (d > 2) p.facing = facingOf(at[0] - cur[0], at[1] - cur[1]);
  }
  drawnAt(p, now) {
    if (!p.dur) return p.to;
    const k = clamp01((now - p.t0) / p.dur);
    return [p.from[0] + (p.to[0] - p.from[0]) * k, p.from[1] + (p.to[1] - p.from[1]) * k];
  }
  spot(id) { return this.room && Array.isArray(this.room.spots) ? this.room.spots.find(s => s.id === id) || null : null; }

  // ------------------------------------------------------------------ the picture
  loadPicture(id) {
    if (this.pic && this.pic.id === id) return;
    const entry = rooms.get(id);
    if (!entry) { this.pic = null; return; }
    const img = new Image();
    const pic = { id, entry, img, ready: false, lights: null, baked: null, key: "" };
    img.onload = () => { pic.ready = true; pic.lights = this.lightsOf(img); };
    img.src = `rooms/${encodeURIComponent(id)}.webp`;
    this.pic = pic;
  }
  // The picture's own lamps and lit glass: warm, bright pixels, kept apart so they still glow when night darkens the rest.
  lightsOf(img) {
    try {
      const c = document.createElement("canvas"), W = Math.max(1, Math.round(img.naturalWidth / 2)), H = Math.max(1, Math.round(img.naturalHeight / 2));
      c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i + 1], b = px[i + 2], lum = 0.3 * r + 0.59 * gg + 0.11 * b;
        const warm = r - b, k = clamp01((lum - 175) / 60) * clamp01((warm - 40) / 60);
        px[i + 3] = Math.round(px[i + 3] * k);
      }
      g.putImageData(d, 0, 0);
      return c;
    } catch { return null; }
  }
  // The picture as the hour shows it, re-made only when the light moves a step.
  baked(m) {
    const pic = this.pic, L = lightAt(m), night = 1 - daylight(m);
    const tint = Math.round(clamp01((L.amt - 0.08) * 0.75) * 20) / 20, glow = Math.round(clamp01((night - 0.15) / 0.6) * 10) / 10;
    const day = Math.round(clamp01(daylight(m) - L.gold * 1.2) * 10) / 10;
    const key = `${tint}|${glow}|${day}|${L.amb.join(",")}`;
    if (pic.baked && pic.key === key) return pic.baked;
    const img = pic.img, c = pic.baked || document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    // By day the golden-hour painting softens toward champagne daylight; at night the room goes dim around its lamps.
    if (day > 0 && "filter" in g) g.filter = `saturate(${1 - 0.14 * day}) brightness(${1 + 0.04 * day})`;
    g.drawImage(img, 0, 0);
    if ("filter" in g) g.filter = "none";
    if (tint > 0) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = `rgba(${L.amb.join(",")},${(tint * 0.75).toFixed(3)})`;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-over";
    }
    if (glow > 0 && pic.lights) {
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.55 * glow;
      g.drawImage(pic.lights, 0, 0, c.width, c.height);
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    pic.baked = c; pic.key = key;
    return c;
  }

  // ------------------------------------------------------------------ showing it
  covering() { return !!(this.attached && this.room && !this.mapMode && this.pic && this.pic.ready && this.game.phase === "playing"); }
  setMapMode(on) {
    this.mapMode = !!on;
    if (!on) { this.userView = false; this.view = null; }
    this.game.ui.announce(on ? "Showing the town. You're still inside." : "Back in the room.");
  }
  sync() {
    const on = this.covering(), app = document.getElementById("app");
    if (this.canvas.hidden === on) this.canvas.hidden = !on;
    app.classList.toggle("in-room", on);
    const roomHere = !!(this.room && this.pic && this.pic.ready && this.game.phase === "playing");
    this.toggle.hidden = !roomHere || this.game.phoneUI.open;
    if (roomHere) {
      const want = this.mapMode ? "room" : "map";
      if (this.toggle.dataset.mode !== want) {
        this.toggle.dataset.mode = want;
        this.toggle.replaceChildren(icon(this.mapMode ? "home" : "map"), el("span", null, this.mapMode ? "Room" : "Map"));
        this.toggle.setAttribute("aria-label", this.mapMode ? "Back to the room" : "Show the town (you stay inside)");
      }
    }
    const me = this.people.get(this.game.world.selfId);
    this.standBtn.hidden = !on || !me || !me.spot || !SEATS.has((this.spot(me.spot) || {}).kind);
  }

  fit(W, H) {
    const ins = this.game.ui.insets(), size = this.room.size;
    const top = ins.top + 4, bottom = H - ins.bottom - 4, left = ins.left + 4, right = W - 4;
    const aw = Math.max(80, right - left), ah = Math.max(80, bottom - top);
    let s = Math.min(aw / size[0], ah / size[1]);
    // A phone: the room fills more of the height and pans sideways, following you (pinch to see it all).
    if (aw < 600) s = Math.max(s, Math.min(ah * 0.85 / size[1], aw * 2.1 / size[0]));
    const me = this.people.get(this.game.world.selfId), c = me ? me.to : [size[0] / 2, size[1] / 2];
    let ox = left + aw / 2 - c[0] * s, oy = top + ah / 2 - size[1] / 2 * s;
    const iw = size[0] * s;
    if (iw <= aw) ox = left + (aw - iw) / 2; else ox = Math.min(left, Math.max(right - iw, ox));
    return { s, ox, oy, min: Math.min(aw / size[0], ah / size[1]) * 0.85, auto: true };
  }
  toScreen(p) { const v = this.view; return v ? [p[0] * v.s + v.ox, p[1] * v.s + v.oy] : null; }
  toRoom(x, y) { const v = this.view; return [(x - v.ox) / v.s, (y - v.oy) / v.s]; }

  frame(now) {
    if (!this.attached) return;
    this.sync();
    if (!this.covering()) return;
    const cv = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (!this.userView || !this.view) {
      const f = this.fit(W, H);
      if (!this.view || this.view.auto === false) this.view = f;
      else {
        // Eased, so a card opening or closing doesn't make the room jump. Within half a pixel it stops moving.
        const k = 0.2, near = (a, b) => Math.abs(a - b) < 0.5;
        const s1 = this.view.s + (f.s - this.view.s) * k, ox = this.view.ox + (f.ox - this.view.ox) * k, oy = this.view.oy + (f.oy - this.view.oy) * k;
        this.view = { ...f, s: Math.abs(f.s - s1) * 1536 < 0.5 ? f.s : s1, ox: near(ox, f.ox) ? f.ox : ox, oy: near(oy, f.oy) ? f.oy : oy };
      }
    }
    const ctx = this.ctx, w = this.game.world, m = w.minute(now) ?? 720, night = 1 - daylight(m);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Around the room: the town's night or day colour.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, night > 0.5 ? "#061c1d" : "#0f3229"); bg.addColorStop(1, night > 0.5 ? "#03111a" : "#0b2b23");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const v = this.view, pic = this.pic, e = pic.entry, baked = this.baked(m);
    // The client copy is the picture trimmed (offset) and maybe scaled: room pixels -> copy pixels.
    const dx = v.ox + (e.offset[0]) * v.s, dy = v.oy + (e.offset[1]) * v.s, dw = baked.width / e.scale * v.s, dh = baked.height / e.scale * v.s;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(baked, dx, dy, dw, dh);
    this.drawHotspots(ctx, now);
    this.drawPeople(ctx, baked, now, night, m);
    this.drawLabels(ctx, now);
  }

  // What you can tap in the room, as soft gold rings on the floor (D-078): the counter, the stage, your work station
  // and, for each thing to do, the free spot nearest you (where the server walks you for it). Not a spot in use.
  hotspots() {
    const w = this.game.world, here = w.here;
    if (!here || !this.room) return [];
    const acts = new Set((here.activities || []).map(a => a.id)), c = w.career;
    const works = w.self && (w.self.onShift || (c && Array.isArray(c.workplaces) && c.workplaces.includes(here.name)));
    const taken = new Set([...this.people.values()].map(p => p.spot).filter(Boolean));
    const me = this.people.get(w.selfId), at = me ? me.to : null, near = new Map();
    const out = [];
    for (const s of this.room.spots || []) {
      if (taken.has(s.id)) continue;
      if (s.activity && acts.has(s.activity)) {
        const d = at ? Math.hypot(s.at[0] - at[0], s.at[1] - at[1]) : 0, best = near.get(s.activity);
        if (!best || d < best.d) near.set(s.activity, { s, d });
      } else if ((s.kind === "counter" && s.offers && (here.offers || []).length) || s.kind === "stage" || (s.staff && works)) out.push(s);
    }
    return out.concat([...near.values()].map(x => x.s));
  }
  drawHotspots(ctx, now) {
    const v = this.view, P = (this.room.person_px || 120) * v.s, still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rx = Math.max(9, Math.min(26, P * 0.2));
    ctx.save();
    this.hotspots().forEach((s, i) => {
      const [x, y] = this.toScreen(s.at), hot = this.pulse && this.pulse.id === s.id && this.pulse.until > now;
      const breathe = still ? 0.6 : 0.45 + 0.25 * Math.sin(now / 700 + i * 1.7);
      ctx.fillStyle = `rgba(218, 187, 133, ${breathe * 0.35})`; ctx.strokeStyle = `rgba(232, 207, 156, ${breathe + 0.2})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (hot && !still) {
        const k = ((this.pulse.until - now) % 600) / 600, r = rx * (1 + (1 - k) * 1.4);
        ctx.strokeStyle = `rgba(255, 243, 223, ${k})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      }
    });
    ctx.restore();
  }
  // A tray chip was tapped: its spot rings out while you walk over.
  pulseActivity(activityId) {
    const s = this.hotspots().find(x => x.activity === activityId);
    if (s) this.pulse = { id: s.id, until: performance.now() + 1800 };
  }
  // Everyone, back to front; furniture standing between a person and the viewer is drawn again over them.
  drawPeople(ctx, baked, now, night, m) {
    const w = this.game.world, v = this.view, P = (this.room.person_px || 120) * v.s, e = this.pic.entry, L = lightAt(m);
    const list = [];
    for (const [id, p] of this.people) {
      const at = this.drawnAt(p, now), walking = p.dur && now - p.t0 < p.dur;
      const s = p.spot && !walking ? this.spot(p.spot) : null;
      const pose = walking ? "walk" : s && SITS.has(s.kind) ? "sit" : "stand";
      const facing = s && !walking ? s.facing : p.facing;
      // The steps follow the ground covered: a cycle (two steps) per 0.86 of a person's height walked.
      const walked = walking ? Math.hypot(at[0] - p.from[0], at[1] - p.from[1]) : 0;
      list.push({ id, at, pose, facing, kind: s ? s.kind : null, phase: walked / ((this.room.person_px || 120) * 0.86) });
    }
    list.sort((a, b) => a.at[1] - b.at[1]);
    this.hits = [];
    this.drawn.clear();
    const names = [];
    const blocked = Array.isArray(this.room.blocked) ? this.room.blocked : [];
    for (const it of list) {
      const person = it.id === w.selfId ? { ...(w.self || {}), id: it.id, name: w.selfName } : (w.people.get(it.id) || { id: it.id, name: w.nameOf(it.id) });
      const [sx, sy] = this.toScreen(it.at), self = it.id === w.selfId;
      const f = FACING[it.facing] || FACING.s;
      const got = drawFigure(ctx, person, sx, sy, { height: P, facing: f.facing, mirror: f.mirror, pose: it.pose, phase: it.phase,
        night, selected: self, scripted: !!person.scripted, tint: L.gold > 0.05 ? ["#ffc070", 0.14 * L.gold] : null,
        // How high the seat is for its kind (figures/manifest.json "$seats"): a seated frame sits on it.
        seat: it.pose === "sit" ? P * seatHeight(it.kind) : null, seatKind: it.pose === "sit" ? it.kind : null });
      const box = [got.x0, got.y0, got.x1 - got.x0, got.y1 - got.y0], top = got.y0;
      // Furniture in front of them: the picture again, clipped to that furniture, over the box they're drawn in. A
      // seated frame's legs reach forward (D-072): furniture in front of their knees (a table the legs go under) counts
      // as in front of them, and so does the far part of the footprint their own seat belongs to (a booth and its table
      // are one footprint): what lies further ahead of the seat on the floor than the kind's reach ("$seats").
      const P0 = this.room.person_px || 120, reach = got.mode === "seat" ? seatTune(it.kind).reach * P0 : 0;
      const knee = reach > 0 ? this.ahead(it.at, it.facing, reach) : null;
      for (const b of blocked) {
        if (!(b.height > 0) || !Array.isArray(b.poly)) continue;
        const own = inPoly(it.at, b.poly);
        const front = inFront(b.poly, it.at) || (!!knee && !own && (inFront(b.poly, knee) || inPoly(knee, b.poly)));
        const foot = front ? b.poly : own && knee ? this.beyond(b.poly, knee, it.facing) : null;
        if (!foot || foot.length < 3) continue;
        const shape = hull(foot.concat(foot.map(q => [q[0], q[1] - b.height])));
        ctx.save();
        ctx.beginPath(); ctx.rect(box[0] - 2, box[1] - 2, box[2] + 4, box[3] + 4); ctx.clip();
        ctx.beginPath(); shape.forEach((q, i) => { const [qx, qy] = this.toScreen(q); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); }); ctx.closePath(); ctx.clip();
        ctx.drawImage(baked, v.ox + e.offset[0] * v.s, v.oy + e.offset[1] * v.s, baked.width / e.scale * v.s, baked.height / e.scale * v.s);
        ctx.restore();
      }
      if (!self && P > 26) names.push({ x: sx, y: top - 4, text: firstName(person.name || it.id), near: sy });
      this.hits.push({ kind: "person", id: it.id, box });
      this.drawn.set(it.id, { pose: it.pose, frame: got.frame || null, mode: got.mode || null, box: box.map(v => Math.round(v)) });
    }
    this.drawNames(ctx, names, P);
    this.drawBubbles(ctx, now);
  }
  // The point on the floor `dist` ahead of `at` the way a seat faces (room pixels).
  ahead(at, facing, dist) {
    const d = ISO[facing] || ISO.s, n = Math.hypot(d[0], d[1]);
    return [at[0] + d[0] / n * dist, at[1] + d[1] / n * dist];
  }
  // The part of a footprint beyond a point on the floor, the way a seat faces (a polygon clipped by a half-plane).
  beyond(poly, from, facing) {
    const d = ISO[facing] || ISO.s, side = q => (q[0] - from[0]) * d[0] + (q[1] - from[1]) * d[1], out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) { const k = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    return out;
  }
  // First names over heads, last so furniture never covers them; the nearer of two that would overlap wins.
  drawNames(ctx, names, P) {
    const fs = Math.max(10, Math.round(P * 0.11)), h = Math.max(14, Math.round(P * 0.13)), placed = [];
    ctx.save(); ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const n of names.sort((a, b) => b.near - a.near)) {
      const w = ctx.measureText(n.text).width + 10, r = [n.x - w / 2, n.y - h, w, h];
      if (placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) continue;
      placed.push(r);
      ctx.fillStyle = "rgba(11,43,35,.78)"; ctx.beginPath(); ctx.roundRect(r[0], r[1], w, h, 6); ctx.fill();
      ctx.fillStyle = "#f7ecd6"; ctx.fillText(n.text, n.x, n.y - 1);
    }
    ctx.restore();
  }
  drawBubbles(ctx, now) {
    const w = this.game.world, P = (this.room.person_px || 120) * this.view.s;
    for (const b of w.liveBubbles(now)) {
      const p = this.people.get(b.who);
      if (!p || b.kind === "whispering") continue;
      const [x, y] = this.toScreen(this.drawnAt(p, now)), text = String(b.text || "").slice(0, 90);
      if (!text) continue;
      ctx.save(); ctx.font = "14px system-ui, sans-serif";
      const tw = Math.min(220, ctx.measureText(text).width) + 16, by = y - P * 1.15 - 30;
      ctx.fillStyle = b.volume === "shout" ? "#fff4d6" : "rgba(247,236,214,.96)"; ctx.strokeStyle = "#dabb85"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x - tw / 2, by, tw, 26, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#13261f"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, x, by + 13, 220); ctx.restore();
    }
  }
  drawLabels(ctx, now) {
    const lab = this.label && this.label.until > now ? this.label : this.hover;
    if (!lab) { this.tag.hidden = true; return; }
    const p = this.toScreen(lab.at);
    if (!p) return;
    this.tag.hidden = false;
    if (this.tag.textContent !== lab.text) this.tag.textContent = lab.text;
    this.tag.style.left = `${Math.round(p[0])}px`; this.tag.style.top = `${Math.round(p[1])}px`;
  }

  // ------------------------------------------------------------------ input
  attachInput() {
    const cv = this.canvas, pointers = new Map();
    let drag = null, pinch = null;
    cv.addEventListener("pointerdown", e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, ox: this.view ? this.view.ox : 0, oy: this.view ? this.view.oy : 0, moved: false };
      if (pointers.size === 2 && this.view) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: this.view.s, ox: this.view.ox, oy: this.view.oy, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        if (drag) drag.moved = true;
      }
    });
    cv.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) { if (e.pointerType === "mouse") this.hoverAt(e.clientX, e.clientY); return; }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.zoomTo(pinch.s * d / Math.max(1, pinch.d), pinch.mx, pinch.my, pinch);
        return;
      }
      if (drag && this.view) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 8) return;
        drag.moved = true; this.userView = true;
        this.view = { ...this.view, ox: drag.ox + dx, oy: drag.oy + dy, auto: false };
      }
    });
    const end = e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        const d = drag; drag = null;
        if (d && !d.moved && e.type === "pointerup") this.tap(e.clientX, e.clientY);
      } else if (pointers.size === 1 && this.view) {
        const [p] = [...pointers.values()];
        drag = { x: p[0], y: p[1], ox: this.view.ox, oy: this.view.oy, moved: true };
      }
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { this.hover = null; });
    // A tap can open the scene card right under the finger (the counter's Buy); without this the browser's follow-up
    // click lands on whatever the card put there (as on the map, render2d.js).
    cv.addEventListener("touchend", e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    cv.addEventListener("wheel", e => {
      if (!this.view) return;
      e.preventDefault();
      this.zoomTo(this.view.s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, this.view);
    }, { passive: false });
  }
  zoomTo(s, mx, my, from) {
    const r = this.canvas.getBoundingClientRect(), x = mx - r.left, y = my - r.top;
    const min = (this.view && this.view.min) || 0.1, ns = Math.max(min, Math.min(min * 6, s));
    // Keep the room point under the fingers where it is.
    const px = (x - from.ox) / from.s, py = (y - from.oy) / from.s;
    this.userView = true;
    this.view = { ...this.view, s: ns, ox: x - px * ns, oy: y - py * ns, auto: false };
  }

  // What's under a screen point: a person, a spot, or the floor.
  hitAt(clientX, clientY) {
    if (!this.view || !this.room) return null;
    const r = this.canvas.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i], [bx, by, bw, bh] = h.box;
      if (h.id !== this.game.world.selfId && x >= bx && x <= bx + bw && y >= by && y <= by + bh) return { kind: "person", id: h.id };
    }
    const p = this.toRoom(x, y), P = this.room.person_px || 120;
    let best = null, bestD = Infinity;
    for (const s of this.room.spots || []) {
      const at = vec(s.at);
      if (!at) continue;
      let d;
      if (s.kind === "door") {
        const inX = Math.abs(p[0] - at[0]) <= P * 0.4, inY = p[1] <= at[1] + P * 0.12 && p[1] >= at[1] - P * 1.35;
        d = inX && inY ? Math.abs(p[0] - at[0]) / P : Infinity;
      } else {
        const lift = SITS.has(s.kind) ? 0.3 : s.kind === "stage" ? 0.25 : 0.45, rad = SITS.has(s.kind) ? 0.24 : s.kind === "stage" ? 0.5 : 0.38;
        const c = [at[0] + (s.kind === "counter" ? (ISO[s.facing] || [0, 0])[0] * P * 0.15 : 0), at[1] - P * lift];
        d = Math.hypot(p[0] - c[0], (p[1] - c[1]) * 1.2) / P;
        if (d > rad) d = Infinity;
      }
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) return { kind: "spot", spot: best, at: vec(best.at) };
    return { kind: "floor", at: p };
  }
  hoverAt(cx, cy) {
    if (!this.covering()) return;
    const h = this.hitAt(cx, cy);
    this.hover = h && h.kind === "spot" ? { text: this.spotText(h.spot), at: [h.at[0], h.at[1] - (this.room.person_px || 120) * 0.95] } : null;
    this.canvas.style.cursor = h && h.kind !== "floor" ? "pointer" : this.walkable(h && h.at) ? "crosshair" : "default";
  }
  spotText(s) {
    const here = this.game.world.here, act = s.activity && here && (here.activities || []).find(a => a.id === s.activity);
    if (s.kind === "door" && !s.activity) return `${s.label} · tap to leave`;
    if (act) return `${s.label} · ${act.label}`;
    if (s.kind === "counter" && s.offers) return `${s.label} · tap to buy`;
    if (s.offers) return `${s.label} · sit to order`;
    if (s.kind === "stage") return `${s.label} · tap to perform`;
    return s.label;
  }
  walkable(p) {
    if (!p || !this.room) return false;
    return (this.room.floor || []).some(f => inPoly(p, f)) && !(this.room.blocked || []).some(b => inPoly(p, b.poly));
  }
  // The open floor nearest a point, within reach of a finger.
  snap(p) {
    if (this.walkable(p)) return p;
    const P = this.room.person_px || 120;
    for (let r = 4; r <= P * 0.35; r += 4) {
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, q = [p[0] + r * Math.cos(a), p[1] + r * 0.5 * Math.sin(a)];
        if (this.walkable(q)) return q;
      }
    }
    return null;
  }
  showLabel(text, at) { this.label = { text, at: [at[0], at[1] - (this.room.person_px || 120) * 0.95], until: performance.now() + 2600 }; }

  async tap(cx, cy) {
    const g = this.game, ui = g.ui, w = g.world;
    if (g.phase !== "playing" || g.phoneUI.open || !this.covering()) return;
    const h = this.hitAt(cx, cy);
    if (!h) return;
    if (h.kind === "person") { ui.sheetPerson(h.id); return; }
    if (h.kind === "floor") {
      const p = this.snap(h.at);
      if (!p) return;
      await this.moveTo(p);
      return;
    }
    const s = h.spot, here = w.here;
    // Someone else's seat is them: their card (the server would refuse the chair anyway).
    const holder = [...this.people.entries()].find(([id, p]) => p.spot === s.id && id !== w.selfId);
    if (holder && SITS.has(s.kind)) { this.showLabel(`${firstName(w.nameOf(holder[0]))} is ${s.kind === "cell" ? "held" : "sitting"} here`, h.at); ui.sheetPerson(holder[0]); return; }
    this.showLabel(this.spotText(s), h.at);
    if (SEATS.has(s.kind)) { await this.sit(s); return; }
    const act = s.activity && here && (here.activities || []).find(a => a.id === s.activity);
    if (s.kind === "door" && !s.activity) { await g.exit(); return; }
    if (act) { await g.activity(act); return; }
    if (s.kind === "counter" && s.offers) { ui.sheetBuy(); return; }
    if (s.kind === "stage") {
      // The card's Do section lists a Perform for each song you can play (verbs.js); with none, say what's missing.
      const found = await this.openCard('[data-verb^="perform:"]', true);
      if (!found) ui.toast("To perform here you need a song: write one or release one in the Studio app.", false, { action: { label: "Studio", run: () => g.openPhone("studio") } });
      return;
    }
    // Your work station: start a shift, or on one, the decisions waiting in the work app.
    if (s.staff) {
      const c = w.career, works = w.self.onShift || (c && Array.isArray(c.workplaces) && c.workplaces.includes(here.name));
      if (w.self.onShift) g.openPhone("work"); else if (works) await g.work("start");
    }
  }
  // The scene card, opened at the part this spot is for. The Do section's verbs arrive a moment after the card.
  async openCard(selector, waitForVerbs = false) {
    this.game.ui.sheetScene({ card: true, height: "half" });
    const find = () => document.querySelector(`#sheet ${selector}`);
    let n = find();
    for (let i = 0; waitForVerbs && !n && i < 12; i++) { await new Promise(r => setTimeout(r, 100)); n = find(); }
    if (!n) return false;
    n.scrollIntoView({ block: "center" }); n.focus({ preventScroll: true });
    return true;
  }
  async moveTo(p) {
    const g = this.game, r = await g.req("move_inside", { x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 });
    if (!r.ok) { g.ui.refusal(r); return r; }
    this.place(g.world.selfId, vec(r.data.at), null);
    return r;
  }
  async sit(s) {
    const g = this.game, r = await g.req("sit", { spot: s.id });
    if (!r.ok) { g.ui.refusal(r, `Sit at ${s.label}`); return r; }
    this.place(g.world.selfId, vec(r.data.at), s.id);
    // What the seat is for, one tap away: its activity, or ordering what's served there.
    const here = g.world.here, act = s.activity && here && (here.activities || []).find(a => a.id === s.activity);
    const action = act ? { label: act.label, run: () => g.activity(act) } : s.offers ? { label: "Order", run: () => this.openCard("[data-buy]") } : undefined;
    g.ui.toast(`Sitting: ${s.label}.`, false, { log: false, ms: 3200, action });
    return r;
  }
  async stand() {
    const g = this.game, r = await g.req("stand");
    if (!r.ok) { g.ui.refusal(r); return r; }
    this.place(g.world.selfId, vec(r.data.at), null);
    return r;
  }
  spotScreen(id) {
    const s = this.spot(id);
    if (!s || !this.view) return null;
    const P = this.room.person_px || 120, lift = s.kind === "door" ? 0.5 : SITS.has(s.kind) ? 0.3 : s.kind === "stage" ? 0.25 : 0.45;
    const [x, y] = this.toScreen([s.at[0], s.at[1] - P * lift]), r = this.canvas.getBoundingClientRect();
    return [x + r.left, y + r.top];
  }
  personScreen(id) {
    const p = this.people.get(id);
    if (!p || !this.view) return null;
    const [x, y] = this.toScreen(this.drawnAt(p, performance.now())), r = this.canvas.getBoundingClientRect();
    return [x + r.left, y - (this.room.person_px || 120) * this.view.s * 0.5 + r.top];
  }
}
