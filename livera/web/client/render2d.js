// The 2.5D isometric renderer, forked from the town preview (days20_shell.html): the same
// projection P(), boxes, cranes, labels, weather, bubbles and tap detection, drawing the live
// world model instead of a recording. It reads `World` and never changes it; taps are handed
// to the UI as intents. A three.js renderer can replace this file behind the same interface:
// new Renderer(canvas, world), .frame(now), .onTap, .select(), .centerOn(), .setRing().
//
// The look follows the owner's reference art: a cream parchment town of ivory, sand stone and
// warm brick with champagne-gold trim, sage lawns and trees, a blue-teal river under an arched
// stone bridge, and Line 1 drawn as a gold loop with numbered stops. The light follows the game
// clock (LIGHT in layout.js): warm champagne by day, golden hour at dawn and dusk, deep
// emerald-navy at night with gold lights.

import { PAL, SPECIAL_COLORS, GOLD_EDGED, LOOK, LIGHT, footprint, ROADS, PARK_SHAPES, RIVER, BRIDGE, TREES, streetTrees,
         TILE_METERS, BRIDGE_ART, CRANE_M, SHELTER_M, SITE_FRAMED_PCT, SITE_ART_CRANES, PARK_ART, ROAD_WORKS } from "./layout.js";
import { predict, dist } from "./state.js";
import { spriteUrl, firstName, loadTileManifest, tileInfo, tileUrl } from "./dom.js";
import { drawIcon, kindIcon } from "./icons.js";
import { drawFigure, facingFor, loadFigureManifest } from "./figures.js";

const C = Math.cos(Math.PI / 6), S = 0.5;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Canvas type: the poster's lettering (self-hosted in fonts/, with real fallbacks) and a sans for speech.
const CAPS = '"Cinzel", Georgia, "Times New Roman", serif';
const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
// The default zoom: buildings about 110 px wide on a phone, so the pictures read (UX 3.9).
export const DEFAULT_ZOOM = { phone: 2.8, wide: 3.0 };
// The closest zoom: near enough to see a person whole (about 55 px tall).
const MAX_ZOOM = 14;
// People stand at real scale against the building pictures, not the sketch's boxes: the pictures
// paint their buildings about 2.2 times the sketch's metres (Heritage Coffee's door is 2.3 m at 43 px
// of its 640, on a lot drawn 36 m across), so a 1.75 m person is 1.75 x 2.2 sketch units tall.
const ART_M = 2.2, PERSON_M = 1.75;
// The smallest a person is drawn at the usual zooms (see personHeight).
const MIN_PERSON_PX = 26;
// A walk cycle (two steps) covers about 0.86 of a person's height; the cadence stays between a stroll's and
// a run's (cycles a second), so a fast clock or a close zoom never turns the steps into a blur.
const WALK_CYCLE_HEIGHTS = 0.86, WALK_CADENCE = [0.8, 2.6];
// Places whose names are always shown when they're open and in view: where everyday needs are met.
const EVERYDAY = new Set(["coffee_shop", "grocery", "pharmacy", "clinic", "restaurant"]);
const FLOAT_MS = 2400;

export function daylight(m) {
  const h = (m % 1440) / 60;
  if (h < 5 || h >= 20) return 0; if (h < 7) return (h - 5) / 2; if (h < 18) return 1; return 1 - (h - 18) / 2;
}
export const phaseName = m => { const h = (m % 1440) / 60; return h >= 5 && h < 7 ? "dawn" : h >= 7 && h < 18 ? "day" : h >= 18 && h < 20 ? "dusk" : "night"; };
export const stamp = m => `${DAYS[Math.floor(m / 1440) % 7]} ${String(Math.floor(m % 1440 / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

const mix = (a, b, k) => {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("");
};
const rgba = (hex, a) => { const p = hex.match(/\w\w/g).map(h => parseInt(h, 16)); return `rgba(${p[0]},${p[1]},${p[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
const clamp01 = v => Math.max(0, Math.min(1, v));

// The light at a clock minute: LIGHT's keys, eased between.
export function lightAt(m) {
  const h = (((m % 1440) + 1440) % 1440) / 60;
  let i = 0;
  while (i < LIGHT.length - 2 && LIGHT[i + 1][0] <= h) i++;
  const a = LIGHT[i], b = LIGHT[i + 1], k = b[0] > a[0] ? clamp01((h - a[0]) / (b[0] - a[0])) : 0, t = k * k * (3 - 2 * k);
  return { hour: h, top: mix(a[1], b[1], t), mid: mix(a[2], b[2], t), low: mix(a[3], b[3], t), amb: mix(a[4], b[4], t),
           amt: a[5] + (b[5] - a[5]) * t, gold: a[6] + (b[6] - a[6]) * t };
}

function seeded(id, n) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1103515245 + 12345) >>> 0) % n); }
function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
// Convex hull (monotone chain) of a few points: a building's shadow on the ground.
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// A smooth closed loop through the stops (centripetal Catmull-Rom: no loops or overshoot).
function loopThrough(pts, steps = 14) {
  const n = pts.length, out = [];
  const knot = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    const L = (a, b, ta, tb, t) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
    for (let k = 0; k < steps; k++) {
      const t = t1 + (t2 - t1) * (k / steps);
      const A1 = L(p0, p1, 0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
      out.push(L(L(A1, A2, 0, t2, t), L(A2, A3, t1, t3, t), t1, t2, t));
    }
  }
  return out;
}
// A soft warm light, drawn once and stamped wherever a lamp, window or fairy light glows.
function glowSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,232,176,1)"); gr.addColorStop(0.22, "rgba(255,208,130,.6)"); gr.addColorStop(1, "rgba(255,190,110,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// The warm lights in a building sprite (lit windows, lamps, fairy lights): the bright, saturated
// warm pixels, kept on their own layer so they still glow when the night darkens the rest.
function spriteLights(img) {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      const warm = r > 215 && gg > 140 && r - b > 95;
      px[i + 3] = warm ? Math.round(px[i + 3] * clamp01(((r + gg) / 2 - 150) / 80)) : 0;
    }
    g.putImageData(d, 0, 0);
    return c;
  } catch { return null; }
}
const quantize = hex => "#" + hex.match(/\w\w/g).map(h => Math.min(255, Math.round(parseInt(h, 16) / 8) * 8).toString(16).padStart(2, "0")).join("");
// The width of a road's asphalt and of its kerbs, in meters: the strokes drawRoads() draws are
// 11 and 14.5 scale units (x0.9) across on screen, and a band of world width w along either axis is
// w x 2CS x scale across on screen.
const ROAD_W = 11 * 0.9 / (2 * Math.cos(Math.PI / 6) * 0.5), KERB_W = 14.5 * 0.9 / (2 * Math.cos(Math.PI / 6) * 0.5);

// Where the sketch's roads meet: {x, y, through, roads}. A junction lies on two perpendicular roads;
// at a T the road it lies inside of (not at one of its ends) goes "through" (null at a crossing).
const JUNCTIONS = (() => {
  const out = [];
  const span = r => { const [[ax, ay], [bx, by]] = r.pts; return ay === by ? { h: true, c: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx) } : { h: false, c: ax, lo: Math.min(ay, by), hi: Math.max(ay, by) }; };
  for (let i = 0; i < ROADS.length; i++) for (let j = i + 1; j < ROADS.length; j++) {
    const a = span(ROADS[i]), b = span(ROADS[j]);
    if (a.h === b.h) continue;
    const [hz, vt] = a.h ? [a, b] : [b, a], [hr, vr] = a.h ? [ROADS[i], ROADS[j]] : [ROADS[j], ROADS[i]];
    const x = vt.c, y = hz.c, tol = 1;
    if (x < hz.lo - tol || x > hz.hi + tol || y < vt.lo - tol || y > vt.hi + tol) continue;
    const hEnds = x <= hz.lo + tol || x >= hz.hi - tol, vEnds = y <= vt.lo + tol || y >= vt.hi - tol;
    out.push({ x, y, through: hEnds && !vEnds ? vr : vEnds && !hEnds ? hr : null, roads: [hr, vr] });
  }
  return out;
})();

export class Renderer2D {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.world = world;
    this.cw = 0; this.ch = 0; this.dpr = 1;
    this.scale = 1.5; this.ox = 0; this.oy = 0;
    this.follow = true; this.centered = false;
    this.selected = null;            // {kind: "place"|"person"|"stop", id}
    this.ring = null;                // {volume, until}: how far your voice carries
    this.ringHold = null;            // a volume to show while the chat box is in use
    this.hit = [];
    this.shown = new Map();          // id -> smoothed screen-world position
    this.sprites = new Map();        // place id -> {img, lights, baked, key}: the owner's building pictures
    this.spriteTops = new Map();     // place id -> the top of its sprite on screen this frame (labels go above)
    this.onTap = null;
    this.lastNow = performance.now();
    this.placed = [];
    this.bubbleRects = [];           // where speech bubbles were drawn last frame (for tests)
    this.floaters = [];              // {who, text, at, self}: a word rising over someone (a reaction, "+15 Hygiene")
    this.getMarks = null;            // () => {home, work: [ids], next}: places that always get a name
    this.labelCount = 0;
    this.light = lightAt(720); this.litCache = new Map(); this.dim = 0; this.reduce = false;
    this.glowCanvas = glowSprite();
    this.motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.routeCache = { transit: null, loops: [] };
    this.tileSprites = new Map();    // tile id -> {img, info, lights, baked, key}: the owner's ground tiles and set pieces
    this.groundBakes = new Map();    // "id|k|meters" -> {key, pattern, n, meters}: a ground texture lit for the hour
    this.groundCache = null;         // the flat ground drawn offscreen (drawGroundLayer)
    this.loads = 0;                  // pictures loaded so far: the cached ground is re-drawn when one arrives
    loadTileManifest().catch(() => {});
    loadFigureManifest().catch(() => {});
    this.gait = new Map();           // id -> {phase, facing, mirror}: how each person last walked
    // Water glints: fixed spots on the river that catch the light (seeded, so they don't jump).
    const rnd = seeded("river", 100000);
    this.glints = Array.from({ length: 70 }, () => [RIVER.x0 + 6 + rnd() / 100000 * (RIVER.x1 - RIVER.x0 - 10), rnd() / 100000, 3 + rnd() / 100000 * 9, rnd() / 100000 * 6.28]);
    // The canvas only uses a web font once it has loaded; ask for the two the labels use.
    if (document.fonts && document.fonts.load) for (const f of [`600 11px ${CAPS}`, `600 13px ${SERIF}`]) document.fonts.load(f).catch(() => {});
    this.attachInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // ------------------------------------------------------------------ projection and camera
  P(x, y, z = 0) { return [(x - y) * C * this.scale + this.ox, ((x + y) * S - z) * this.scale + this.oy]; }
  unproject(sx, sy) {
    const u = (sx - this.ox) / (C * this.scale), v = (sy - this.oy) / (S * this.scale);
    return [(u + v) / 2, (v - u) / 2];
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const oldW = this.cw, oldH = this.ch;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cw * this.dpr); this.canvas.height = Math.round(this.ch * this.dpr);
    if (oldW) { this.ox += (this.cw - oldW) / 2; this.oy += (this.ch - oldH) / 2; }
  }
  // The town's content (doors and stops), not the server's world bounds, which are mostly empty
  // ground: the whole-town view frames what's there, as it lands on screen (the projected extent,
  // so a portrait phone isn't fitted to the empty corners of the diamond).
  contentExtent() {
    const w = this.world, pts = [...w.places.map(p => p.door), ...w.allStops().map(s => s.at)];
    if (pts.length < 2) { const b = w.bounds; pts.push(b.min, b.max, [b.min[0], b.max[1]], [b.max[0], b.min[1]]); }
    const us = pts.map(p => (p[0] - p[1]) * C), vs = pts.map(p => (p[0] + p[1]) * S);
    // Margins in world units: the buildings stand up from their doors (taller than they're wide).
    return { u0: Math.min(...us) - 30, u1: Math.max(...us) + 30, v0: Math.min(...vs) - 70, v1: Math.max(...vs) + 20 };
  }
  // The visible map, after the panels: what's left of the canvas once the insets are taken off.
  freeView() {
    const ins = this.getInsets ? this.getInsets() : { top: 0, bottom: 0, left: 0 };
    const left = Math.min(ins.left || 0, this.cw * 0.6), top = Math.min(ins.top || 0, this.ch * 0.5), bottom = Math.min(ins.bottom || 0, this.ch - top - 80);
    return { left, top, w: this.cw - left, h: this.ch - top - bottom };
  }
  minScale() {
    const e = this.contentExtent(), v = this.freeView();
    return Math.max(0.2, Math.min(v.w / (e.u1 - e.u0), v.h / (e.v1 - e.v0)) * 0.96);
  }
  // Where the camera centres a world point: a little above the middle, so the bottom sheet and
  // chat bar don't cover you.
  centerTarget(x, y) {
    const [cx, cy] = this.viewCenter();
    return [cx - (x - y) * C * this.scale, cy - (x + y) * S * this.scale];
  }
  // Just above the middle of the map area the panels leave uncovered (the feed sits low).
  viewCenter() {
    const v = this.freeView();
    return [v.left + v.w / 2, v.top + v.h * 0.45];
  }
  centerOn(x, y, follow = false) {
    [this.ox, this.oy] = this.centerTarget(x, y);
    this.follow = follow;
  }
  zoomAt(f, sx, sy) {
    const nz = Math.max(this.minScale(), Math.min(MAX_ZOOM, this.scale * f));
    f = nz / this.scale;
    this.ox = sx - (sx - this.ox) * f; this.oy = sy - (sy - this.oy) * f; this.scale = nz;
  }
  zoomBy(f) { this.zoomAt(f, ...this.viewCenter()); }
  fitTown() {
    this.scale = this.minScale();
    const e = this.contentExtent(), v = this.freeView();
    this.ox = v.left + v.w / 2 - (e.u0 + e.u1) / 2 * this.scale;
    this.oy = v.top + v.h / 2 - (e.v0 + e.v1) / 2 * this.scale;
    this.follow = false;
  }
  defaultZoom() { return this.cw < 700 ? DEFAULT_ZOOM.phone : DEFAULT_ZOOM.wide; }
  followMe() { this.follow = true; if (this.scale < 1.6) this.scale = this.defaultZoom(); }
  // A word that rises over someone's head for a moment: their reaction, or what a meal did for you.
  addFloater(f) {
    if (!f || !f.text) return;
    this.floaters.push({ ...f, at: performance.now() });
    if (this.floaters.length > 6) this.floaters.shift();
  }
  select(s) { this.selected = s; }
  setRing(volume) { this.ring = volume ? { volume, until: performance.now() + 2500 } : null; }

  // A building's sprite once it has loaded (lazily: the box is drawn until then), or null.
  sprite(id) {
    const url = spriteUrl(id);
    if (!url) return null;
    let s = this.sprites.get(id);
    if (!s) {
      s = { id, img: new Image(), lights: null, baked: null, key: "" };
      s.img.decoding = "async";
      s.img.onload = () => { s.lights = spriteLights(s.img); this.loads++; };
      s.img.src = url;
      this.sprites.set(id, s);
    }
    return s.img.complete && s.img.naturalWidth ? s : null;
  }
  // A ground tile or set piece from client/tiles once it has loaded (lazily: the hand-drawn ground,
  // crane, bridge or stop post is drawn until then), or null.
  tile(id) {
    const url = tileUrl(id);
    if (!url) return null;
    let t = this.tileSprites.get(id);
    if (!t) {
      t = { img: new Image(), info: tileInfo(id), lights: null, baked: null, key: "" };
      t.img.decoding = "async";
      t.img.onload = () => { if (t.info.kind === "sprite") t.lights = spriteLights(t.img); this.loads++; };
      t.img.src = url;
      this.tileSprites.set(id, t);
    }
    return t.img.complete && t.img.naturalWidth ? t : null;
  }
  // A ground texture as a CanvasPattern, lit exactly as lit(c, k) lights a colour (toward the hour's
  // ambient light, then toward the night's dark while the ground layer is drawn), done once on the
  // texture. It's baked at about the size it's drawn, so it neither shimmers when it's small nor
  // costs much, and re-baked only when the light moves a step or the zoom doubles or halves.
  groundTexture(id, meters, k = 1) {
    const t = this.tile(id);
    if (!t || t.info.kind !== "texture" || !meters) return null;
    const L = this.light, full = t.img.naturalWidth, want = meters * this.scale * this.dpr * 0.85;
    let n = 16;
    while (n < want && n < full) n *= 2;
    n = Math.min(n, full);
    const a = Math.round(Math.min(0.95, L.amt * k) * 48) / 48, dim = Math.round(this.dim * 48) / 48, amb = quantize(L.amb);
    const key = `${n}|${amb}|${a}|${dim}`, slot = `${id}|${k}|${meters}`;
    let g = this.groundBakes.get(slot);
    if (g && g.key === key) return g;
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(t.img, 0, 0, n, n);
    if (a > 0) { x.fillStyle = rgba(amb, a); x.fillRect(0, 0, n, n); }
    if (dim > 0) { x.fillStyle = rgba("#031118", dim); x.fillRect(0, 0, n, n); }
    const pattern = this.canvas.getContext("2d").createPattern(c, "repeat");
    if (!pattern || typeof pattern.setTransform !== "function" || typeof DOMMatrix === "undefined") return null;
    g = { key, pattern, n, meters };
    this.groundBakes.set(slot, g);
    return g;
  }
  // Lays a ground texture flat on the map: texture pixel (u, v) at world (ox, oy) + (u U + v V) x
  // meters per pixel, through P(), so it scrolls and zooms with the map. U and V default to the
  // world's x and y; a road's gravel turns them so its ruts run along the road.
  laid(g, ox = 0, oy = 0, U = [1, 0], V = [0, 1]) {
    const s = this.scale, m = g.meters / g.n, [e, f] = this.P(ox, oy);
    g.pattern.setTransform(new DOMMatrix([(U[0] - U[1]) * C * s * m, (U[0] + U[1]) * S * s * m, (V[0] - V[1]) * C * s * m, (V[0] + V[1]) * S * s * m, e, f]));
    return g.pattern;
  }
  // The pattern for a whole-map surface (lawn, paving, asphalt) this frame, or the flat colour.
  surface(id, color, k = 1) {
    const g = this.groundTexture(id, TILE_METERS[id], k);
    return g ? this.laid(g) : this.lit(color, k);
  }

  // Where a sprite goes: about 1.15 times the width of the footprint's diamond, centred on it, its
  // base (the picture's own pavement and planters) just below the diamond's front corner.
  spriteRect(s, fp) {
    const P = this.P.bind(this), [lx, ly] = P(fp.x0, fp.y1), [rx, ry] = P(fp.x1, fp.y0), [, ty] = P(fp.x0, fp.y0), [bx, byy] = P(fp.x1, fp.y1);
    const W = (rx - lx) * 1.15, H = W * s.img.naturalHeight / s.img.naturalWidth, cx = (lx + rx) / 2, mid = (ty + byy) / 2;
    const bottom = mid + (byy - mid) * 1.18;
    const x = cx - W / 2, y = bottom - H;
    // The tap target: the lot's front edges and the picture's outline above them.
    const poly = [[x, mid + (ly - mid) * 1.1], [bx + (bx - cx) * 0.1, bottom], [x + W, mid + (ry - mid) * 1.1], [x + W, y + H * 0.22], [cx, y], [x, y + H * 0.22]];
    // Selected: a gold ring of the lot on the ground, wide enough to show around the picture's base.
    const k = 1.4, lot = [[cx + (lx - cx) * k, mid + (ly - mid) * k], [cx + (bx - cx) * k, mid + (byy - mid) * k], [cx + (rx - cx) * k, mid + (ry - mid) * k], [cx + (bx - cx) * -k, mid + (ty - mid) * k]];
    return { x, y, W, H, poly, bottom, mid, lot };
  }
  // The sprite as the hour shows it, at the size it's drawn: darkened toward the night's colour
  // (less than the boxes, it's a painting of a lit building) with its own lights laid back on top.
  // Re-baked only when the size moves by more than ~12% or the light changes a step.
  bakedSprite(s, width) {
    const L = this.light, night = this.night;
    const tintA = Math.round(clamp01((L.amt - 0.1) * 0.8) * 40) / 40, lightsA = Math.round(clamp01((night - 0.2) / 0.5) * 20) / 20;
    // By day the pictures' golden-hour warmth is softened a little toward the champagne daylight.
    const day = Math.round(clamp01(this.dl - L.gold * 1.2) * 10) / 10;
    const key = `${tintA ? quantize(L.amb) : ""}|${tintA}|${lightsA}|${day}`;
    const wpx = Math.max(8, Math.min(s.img.naturalWidth, Math.round(width * this.dpr)));
    if (s.baked && s.key === key && Math.abs(s.baked.width - wpx) / wpx < 0.12) return s.baked;
    const c = s.baked || document.createElement("canvas");
    c.width = wpx; c.height = Math.max(1, Math.round(wpx * s.img.naturalHeight / s.img.naturalWidth));
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.clearRect(0, 0, c.width, c.height);
    if (day > 0 && "filter" in g) g.filter = `saturate(${1 - 0.16 * day})`;
    g.drawImage(s.img, 0, 0, c.width, c.height);
    if ("filter" in g) g.filter = "none";
    if (day > 0) { g.globalCompositeOperation = "source-atop"; g.fillStyle = rgba("#fff4e0", 0.08 * day); g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = "source-over"; }
    if (tintA > 0) { g.globalCompositeOperation = "source-atop"; g.fillStyle = rgba(quantize(L.amb), tintA); g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = "source-over"; }
    if (lightsA > 0 && s.lights) { g.globalAlpha = lightsA; g.drawImage(s.lights, 0, 0, c.width, c.height); g.globalAlpha = 1; }
    s.baked = c; s.key = key;
    return c;
  }

  // ------------------------------------------------------------------ input: drag, pinch, wheel, tap
  attachInput() {
    const cv = this.canvas, pointers = new Map();
    let drag = null;
    const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    const mid = () => { const r = cv.getBoundingClientRect(), [a, b] = [...pointers.values()]; return [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top]; };
    let press = null;   // a long press walks you exactly there, even onto a building's lot
    const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
    cv.addEventListener("pointerdown", e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { x: e.clientX, y: e.clientY, moved: drag && pointers.size > 1 ? 99 : 0, dist: pointers.size === 2 ? pinchDist() : 0 };
      cancelPress();
      if (pointers.size === 1) {
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        press = { fired: false, timer: setTimeout(() => {
          if (!press || !drag || drag.moved > 6 || pointers.size !== 1) return;
          press.fired = true;
          if (this.onTap) this.onTap({ kind: "ground", world: this.unproject(x, y), long: true });
        }, 600) };
      }
    });
    cv.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId) || !drag) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) { const d = pinchDist(); if (drag.dist) this.zoomAt(d / drag.dist, ...mid()); drag.dist = d; drag.moved = 99; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6 && press && !press.fired) cancelPress();
      if (drag.moved > 6) { cv.classList.add("dragging"); this.follow = false; this.ox += dx; this.oy += dy; }
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const up = e => {
      const long = press && press.fired;
      cancelPress();
      const wasTap = !long && drag && drag.moved <= 6 && pointers.size === 1 && e.type === "pointerup";
      pointers.delete(e.pointerId); cv.classList.remove("dragging");
      if (wasTap) { const r = cv.getBoundingClientRect(); this.tap(e.clientX - r.left, e.clientY - r.top); }
      if (pointers.size === 0) drag = null;
      // A finger lifted mid-pinch: carry on from where the remaining finger is, not from where
      // the last finger to touch down started (moved stays high, so lifting it isn't a tap).
      else if (drag) { const [p] = pointers.values(); drag.x = p[0]; drag.y = p[1]; drag.dist = pointers.size >= 2 ? pinchDist() : 0; }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    // A tap can open a sheet right under the finger; without this the browser's follow-up
    // click lands on whatever the sheet put there.
    cv.addEventListener("touchend", e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }
  // People win over buildings and stops: a person standing in front of a building is who you meant.
  // Among people whose targets overlap (a crowd), the one whose figure is nearest the tap wins.
  hitTest(x, y) {
    const inside = h => (h.rect ? x >= h.rect[0] && x <= h.rect[2] && y >= h.rect[1] && y <= h.rect[3]
      : h.circle ? Math.hypot(x - h.circle[0], y - h.circle[1]) <= h.circle[2] : inPoly(x, y, h.poly));
    let best = null, bd = Infinity;
    for (let i = this.hit.length - 1; i >= 0; i--) {
      const h = this.hit[i];
      if (h.kind !== "person" || !inside(h)) continue;
      const d = Math.hypot(x - h.circle[0], y - h.circle[1]);
      if (d < bd - 0.5) { best = h; bd = d; }
    }
    if (best) return { kind: "person", id: best.id };
    for (let i = this.hit.length - 1; i >= 0; i--) { const h = this.hit[i]; if (h.kind !== "person" && inside(h)) return { kind: h.kind, id: h.id }; }
    return null;
  }
  tap(x, y) {
    const h = this.hitTest(x, y);
    const w = this.unproject(x, y);
    if (this.onTap) this.onTap(h ? { ...h, world: w } : { kind: "ground", world: w });
  }
  // For tests and the UI: where a world point is on screen right now.
  project(x, y, z = 0) { return this.P(x, y, z); }

  // ------------------------------------------------------------------ light and helpers
  // A daylight colour as the hour shows it: tinted toward the ambient light (champagne by day,
  // peach at golden hour, emerald-navy at night). `k` scales how much the surface takes the tint.
  // While the ground layer is drawn, night also dims it (`dim`): buildings, trees and people take
  // the dark in their own colours, and the lights drawn after it stay bright. Cached per frame.
  lit(c, k = 1) {
    const key = this.dim ? `${c}${k}d` : `${c}${k}`;
    let v = this.litCache.get(key);
    if (v === undefined) {
      const L = this.light;
      v = mix(c, L.amb, Math.min(0.95, L.amt * k));
      if (this.dim) v = mix(v, "#031118", this.dim);
      this.litCache.set(key, v);
    }
    return v;
  }
  reduced() { return !!(this.motion && this.motion.matches); }
  // The low sun at golden hour: the faces toward it catch warm gold (east at dawn, south and west
  // in the evening), the others fall into rose shade.
  faces(cols) {
    const g = this.light.gold * (1 - this.night * 0.7);
    if (g < 0.02) return cols;
    const morning = this.light.hour < 12, sun = "#ffbf7a", shade = "#9b7d8e";
    return [mix(cols[0], "#ffdcaa", 0.16 * g), mix(cols[1], morning ? sun : shade, (morning ? 0.4 : 0.24) * g), mix(cols[2], morning ? shade : sun, (morning ? 0.16 : 0.42) * g)];
  }
  glow(x, y, r, alpha, flat = 1) {
    if (alpha <= 0.01 || r <= 0 || x < -r || x > this.cw + r || y < -r * flat || y > this.ch + r * flat) return;
    const ctx = this.ctx;
    ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(this.glowCanvas, x - r, y - r * flat, 2 * r, 2 * r * flat); ctx.globalAlpha = 1;
  }
  poly(pts, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // Window colours for this frame: sky-tinted glass by day, gold reflections at golden hour,
  // dark glass at night; lit windows glow amber.
  windowColors() {
    const L = this.light, night = this.night;
    const day = this.lit(mix(LOOK.glassDay, LOOK.glassGold, Math.min(1, L.gold * 0.75)), 0.6);
    return { off: rgba(mix(day, LOOK.glassNight, clamp01(night * 1.1)), 0.86), on: rgba(LOOK.lit, 0.62 + 0.38 * night),
             gold: rgba(mix(LOOK.gold, L.amb, L.amt * 0.4), 0.95) };
  }
  drawBox(b, colors, opts = {}) {
    const { x0, x1, y0, y1, h } = b, z0 = b.z0 || 0, P = this.P.bind(this), night = opts.night || 0, ctx = this.ctx;
    this.poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, h), P(x1, y0, h)], colors[1]);
    this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, h), P(x0, y1, h)], colors[2]);
    const roof = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)];
    this.poly(roof, colors[0]);
    // A lighter roof with a ledge: the parapet's inner edge.
    const inset = Math.min(1.4, (x1 - x0) * 0.08, (y1 - y0) * 0.08);
    if (opts.trim && inset > 0.4 && this.scale > 0.5) this.poly([P(x0 + inset, y0 + inset, h), P(x1 - inset, y0 + inset, h), P(x1 - inset, y1 - inset, h), P(x0 + inset, y1 - inset, h)], mix(colors[0], colors[1], 0.28));
    const wc = this.wc;
    if (h >= 8 && !z0 && this.scale > 0.35) {
      const rnd = seeded(opts.id || "x", 100), rows = Math.max(1, Math.floor((h - 3) / 4)), lit = opts.litChance ?? 45;
      const winW = opts.glass ? 2.8 : 2.2, gap = opts.glass ? 3.6 : 4;
      const faces = [[(x1 - x0), (k, z) => [x0 + k, y1, z]], [(y1 - y0), (k, z) => [x1, y0 + k, z]]];
      for (const [len, at] of faces) for (let r = 0; r < rows; r++) for (let k = 2; k + winW <= len - 1; k += gap) {
        const z = 3 + r * 4, on = night > 0.2 && rnd() < lit;
        this.poly([P(...at(k, z)), P(...at(k + winW, z)), P(...at(k + winW, z + 2.4)), P(...at(k, z + 2.4))], on ? wc.on : wc.off);
      }
    }
    if (opts.trim) {
      // Champagne-gold trim along the roof edge; glass towers are gold-edged up every corner too.
      ctx.lineWidth = Math.max(0.6, 0.3 * this.scale); ctx.lineJoin = "round";
      this.poly(roof, null, wc.gold);
      if (opts.glass) {
        ctx.beginPath();
        for (const [x, y] of [[x1, y0], [x1, y1], [x0, y1]]) { ctx.moveTo(...P(x, y, z0)); ctx.lineTo(...P(x, y, h)); }
        ctx.stroke();
      }
    }
  }
  drawCrane(x, y, h, working, now) {
    const ctx = this.ctx, P = this.P.bind(this);
    ctx.lineWidth = Math.max(1, 1.2 * this.scale); ctx.strokeStyle = this.lit("#c9993f", 0.5);
    const base = P(x, y, 0), top = P(x, y, h), arm = P(x + 22, y - 6, h), back = P(x - 8, y + 3, h);
    ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...top); ctx.moveTo(...back); ctx.lineTo(...arm); ctx.stroke();
    const hook = P(x + 16, y - 4, h - 10 - (working ? 4 * Math.sin(now / 600) : 0));
    ctx.strokeStyle = rgba(this.lit("#5b4a33", 0.5), 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...P(x + 16, y - 4, h)); ctx.lineTo(...hook); ctx.stroke();
  }
  // A park's picture standing on its lot (PARK_ART), like a building's on its footprint.
  drawLot(spr, fp, night) {
    const r = this.spriteRect(spr, fp);
    if (r.x + r.W < -20 || r.x > this.cw + 20 || r.y > this.ch + 20 || r.bottom < -20) return;
    if (night > 0.3 && this.scale > 0.5) this.glow(r.x + r.W / 2, r.bottom - r.H * 0.35, r.W * 0.6, 0.25 * night, 0.7);
    this.ctx.drawImage(this.bakedSprite(spr, r.W), r.x, r.y, r.W, r.H);
  }
  // Road works to lay along the roads this frame: a road whose project is active, with a picture of
  // its site at the project's stage (ROAD_WORKS says where along the road). The site is the
  // construction-site place whose door lies on the road.
  roadWorks(w) {
    const out = [];
    for (const r of ROADS) {
      const spot = r.project && ROAD_WORKS[r.project], proj = spot && w.projects.get(r.project);
      if (!proj || proj.status !== "active") continue;
      const [[ax, ay], [bx, by]] = r.pts;
      if (ay !== by) continue;   // the picture is mirrored to run along x; no road along y has works
      const site = w.places.find(p => p.type === "construction_site" && Math.abs(p.door[1] - ay) <= KERB_W / 2 && p.door[0] >= Math.min(ax, bx) && p.door[0] <= Math.max(ax, bx));
      if (!site) continue;
      const stage = (proj.progress_pct || 0) >= SITE_FRAMED_PCT ? "framed" : "bare", id = stage === "framed" ? `${site.id}_framed` : site.id;
      const spr = spriteUrl(id) && this.sprite(id);
      if (!spr) continue;
      out.push({ spr, spot, fit: spot[stage], y: ay, depth: (spot.from + spot.to) / 2 + ay + 11, lot: { x0: spot.from - 4, x1: spot.to + 4, y0: ay - 13, y1: ay + 13 } });
    }
    return out;
  }
  // The works picture, mirrored, its road's centre line on the road's: its near end at `to`.
  drawWorks({ spr, spot, fit, y }) {
    const [nx, ny] = this.P(spot.to, y, 0), [fx, fy] = this.P(spot.from, y, 0), near = [1 - fit.near[0], fit.near[1]], far = [1 - fit.far[0], fit.far[1]];
    const W = (nx - fx) / (near[0] - far[0]);
    // Stretched to fit (no shear), or kept to its proportions times `stretch` and sheared by k.
    const H = fit.stretch ? W * spr.img.naturalHeight / spr.img.naturalWidth * fit.stretch : (ny - fy) / (near[1] - far[1]);
    const k = fit.stretch ? ((ny - fy) - (near[1] - far[1]) * H) / (nx - fx) : 0;
    if (!(W > 0 && H > 0)) return;
    const x = nx - near[0] * W, top = ny - near[1] * H - near[0] * W * k;
    const lo = Math.min(top, top + k * W), hi = Math.max(top, top + k * W) + H;
    if (x > this.cw + 20 || x + W < -20 || lo > this.ch + 20 || hi < -20) return;
    const ctx = this.ctx;
    ctx.save(); ctx.transform(1, k, 0, 1, x, top); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.bakedSprite(spr, W), 0, 0, W, H);
    ctx.restore();
  }
  // The crane over a construction project: the owner's crane picture (client/tiles) over an active
  // project, unless the site's own picture already paints cranes. `drawn`: the hand-drawn site (no
  // site picture), which keeps the hand-drawn crane until the crane picture has loaded.
  drawCraneMarker(fp, proj, siteId, dl, now, drawn) {
    const t = this.tile("crane"), a = t && t.info.kind === "sprite" ? t.info.anchors : null, x = fp.x0 + 4, y = fp.y0 + 6;
    const active = !!(proj && proj.status === "active");
    if (!a || !a.ground || !a.jib) {
      if (drawn || (active && !SITE_ART_CRANES.has(siteId))) this.drawCrane(x, y, Math.max(fp.h, 20) + 12, active && dl > 0.5, now);
      return;
    }
    if (!active || SITE_ART_CRANES.has(siteId)) return;
    const [gx, gy] = this.P(x, y, 0), [, jy] = this.P(x, y, CRANE_M), H = (gy - jy) / (a.ground[1] - a.jib[1]), W = H * t.img.naturalWidth / t.img.naturalHeight;
    const left = gx - a.ground[0] * W, top = gy - a.ground[1] * H;
    if (left > this.cw || left + W < 0 || top > this.ch || top + H < 0) return;
    this.ctx.drawImage(this.bakedSprite(t, W), left, top, W, H);
  }
  // While a building is going up, its site's picture (client/sprites/<site>.webp): the framed stage
  // once the project is active and SITE_FRAMED_PCT along, if there is a picture of it, else the bare
  // site. The site is the construction-site place that shares the building's door (`b.site`). null
  // until the picture has loaded (the hand-drawn site is drawn meanwhile).
  siteSprite(b, proj) {
    if (!b.site) return null;
    const framed = `${b.site}_framed`, far = !!(proj && proj.status === "active" && (proj.progress_pct || 0) >= SITE_FRAMED_PCT);
    const id = far && spriteUrl(framed) ? framed : spriteUrl(b.site) ? b.site : null;
    return id ? this.sprite(id) : null;
  }
  drawFrame(b, pct) {
    const ctx = this.ctx, P = this.P.bind(this), h = Math.max(1.5, b.h * pct / 100), col = this.lit("#a8834c", 0.5);
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = Math.max(1, 0.8 * this.scale);
    for (let x = b.x0; x <= b.x1 + 0.1; x += (b.x1 - b.x0) / 4) for (const y of [b.y0, b.y1]) { ctx.beginPath(); ctx.moveTo(...P(x, y, 0)); ctx.lineTo(...P(x, y, h)); ctx.stroke(); }
    for (let z = 0; z <= h; z += 4) this.poly([P(b.x0, b.y0, z), P(b.x1, b.y0, z), P(b.x1, b.y1, z), P(b.x0, b.y1, z)], null, rgba(col, 0.55));
  }
  claim(x, y, w, h, steps = [0, -1, 1, -2, 2, -3]) {
    const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    for (const k of steps) { const yy = y + k * (h + 2); if (!this.placed.some(q => overlaps([x, yy, w, h], q))) { this.placed.push([x, yy, w, h]); return yy; } }
    return null;
  }
  // A name plate like the poster's tiles: deep emerald with ivory serif capitals; selected ones gold.
  // style: "strong" (selected: gold), "mine" (your home, your workplace, the Next target: ivory
  // with a gold edge), "muted" (closed), or plain. glyph: an icons.js name drawn before the text.
  label(text, x, y, z, strong, glyph = null, style = null) {
    const ctx = this.ctx, st = strong ? "strong" : style;
    let [sx, sy] = this.P(x, y, z);
    ctx.font = `600 ${st === "strong" || st === "mine" ? 13 : 12}px ${CAPS}`;
    const g = glyph ? 15 : 0, w = ctx.measureText(text).width + 16 + g, h = 21;
    if (sx < -w || sx > this.cw + w || sy < -20 || sy > this.ch + 20) return false;
    sx = Math.max(w / 2 + 4, Math.min(this.cw - w / 2 - 4, sx));
    const at = this.claim(sx - w / 2, sy - h - 1, w, h);
    if (at === null && st !== "strong") return false;
    if (at !== null) sy = at + h + 1;
    const top = sy - h - 1;
    ctx.beginPath(); ctx.roundRect(sx - w / 2, top, w, h, 5);
    ctx.fillStyle = st === "strong" ? "rgba(218,187,133,.97)" : st === "mine" ? "rgba(251,243,226,.97)" : st === "muted" ? "rgba(46,62,56,.84)" : "rgba(11,43,35,.92)"; ctx.fill();
    ctx.strokeStyle = st === "strong" ? "rgba(11,43,35,.55)" : st === "mine" ? "rgba(180,138,76,.95)" : "rgba(218,187,133,.6)"; ctx.lineWidth = st === "mine" ? 1.5 : 1; ctx.stroke();
    const fg = st === "strong" || st === "mine" ? LOOK.emerald : st === "muted" ? "#cfc4ab" : LOOK.ivory;
    if (glyph) drawIcon(ctx, glyph, sx - w / 2 + 8 + 6, top + h / 2, 13, st === "strong" || st === "mine" ? "#7a5a26" : st === "muted" ? "#b7ab90" : LOOK.goldLight, 1.6);
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, sx + g / 2, top + h / 2 + 0.5);
    this.labelCount++;
    return true;
  }

  // Where a person stands on the map: their position, or in front of the door of the building
  // they're inside (the preview's convention; interiors aren't drawn yet).
  standingPoint(e, now) {
    if (e.inside) {
      const b = this.world.buildingOfPlace.get(e.inside) || this.world.placeById.get(e.inside);
      if (b) return [b.door[0] + 6, b.door[1] + 4];
    }
    return predict(e, now);
  }

  // ------------------------------------------------------------------ the frame
  frame(now) {
    const dt = Math.min(0.25, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const w = this.world;
    const me = w.self && this.standingPoint(w.self, now);
    if (me && (!this.centered || this.follow)) {
      const [tx, ty] = this.centerTarget(me[0], me[1]);
      if (!this.centered) { this.ox = tx; this.oy = ty; this.centered = true; this.scale = this.defaultZoom(); [this.ox, this.oy] = this.centerTarget(me[0], me[1]); }
      else if (this.reduced()) { this.ox = tx; this.oy = ty; }   // reduced motion: the camera snaps
      else { const k = 1 - Math.exp(-dt * 6); this.ox += (tx - this.ox) * k; this.oy += (ty - this.oy) * k; }
    }
    this.draw(now, dt);
  }

  draw(now, dt) {
    const ctx = this.ctx, w = this.world, P = this.P.bind(this), cw = this.cw, ch = this.ch;
    const m = w.minute(now) ?? 720, dl = daylight(m), night = 1 - dl;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.hit = [];
    // The light of the hour; cloud and rain grey it and take the gold out.
    const wx = w.weather, grey = wx ? { cloud: 0.35, rain: 0.55, storm: 0.75, snow: 0.45 }[wx.kind] || 0 : 0;
    const L = lightAt(m);
    if (grey) {
      const g = mix("#121a1c", "#b7b2a8", dl);
      L.top = mix(L.top, g, grey); L.mid = mix(L.mid, g, grey); L.low = mix(L.low, mix("#16201f", "#c4bfb4", dl), grey);
      L.amb = mix(L.amb, mix("#0c1a1e", "#c9c4b8", dl), grey * 0.7); L.amt = Math.min(0.9, L.amt + 0.12 * grey * dl); L.gold *= 1 - grey;
    }
    this.light = L; this.night = night; this.dl = dl; this.now = now; this.litCache.clear(); this.reduce = this.reduced(); this.spriteTops.clear();
    this.wc = this.windowColors();
    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, L.top); g.addColorStop(0.55, L.mid); g.addColorStop(1, L.low);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // The ground layer: parchment, shadows, river, parks, roads, the bridge.
    const B = w.bounds;
    // Night falls on the ground first (not before golden hour has passed: it would dull it).
    this.dim = 0.34 * clamp01((night - 0.3) / 0.7);
    this.drawGroundLayer(w, B, L, dl, grey, now);
    this.dim = 0;
    this.drawGroundLights(w, now);
    this.drawRoutes(w);
    // Your walk target
    const self = w.self;
    if (self && self.target && !self.inside) {
      const sp = predict(self, now), [tx, ty] = P(...self.target);
      if (sp) {
        ctx.strokeStyle = night > 0.5 ? "rgba(232,207,156,.85)" : "rgba(150,108,48,.85)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(...P(...sp)); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = night > 0.5 ? LOOK.goldLight : LOOK.goldDeep; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(tx, ty, 7, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Drawables back to front
    const items = [];
    for (const b of w.buildings) { const fp = footprint(b); items.push({ depth: fp.x1 + fp.y1, kind: "building", b, fp }); }
    this.stopNo = new Map();
    for (const line of w.transit || []) line.stops.forEach((s, i) => { if (!this.stopNo.has(s.id)) this.stopNo.set(s.id, i + 1); });
    for (const s of w.allStops()) items.push({ depth: s.at[0] + s.at[1], kind: "stop", s });
    // The bridge picture stands in the river: behind the trees on the bank south of it, in front of those north.
    if (this.bridgeAt) items.push({ depth: BRIDGE_ART.x0 + BRIDGE.y - 9, kind: "bridge" });
    // Pictures laid on the ground (a park's, road works'): the sketch's trees inside them give way.
    const lots = [];
    for (const pl of w.places) {
      const lot = pl.type === "park" && PARK_ART[pl.id], spr = lot && this.sprite(pl.id);
      if (!spr) continue;
      // The picture has its own trees: the sketch's give way across the park's whole oval.
      const sh = PARK_SHAPES[pl.id] || { rx: 30, ry: 28 }, [cx, cy] = pl.door;
      lots.push({ x0: cx - sh.rx - 4, x1: cx + sh.rx + 4, y0: cy - sh.ry - 4, y1: cy + sh.ry + 4 });
      items.push({ depth: lot.x1 + lot.y1, kind: "lot", spr, fp: lot });
    }
    for (const works of this.roadWorks(w)) { lots.push(works.lot); items.push({ depth: works.depth, kind: "works", works }); }
    for (const [x, y, s] of this.treesFor(w)) {
      if (!lots.some(l => x > l.x0 - 2 && x < l.x1 + 2 && y > l.y0 - 2 && y < l.y1 + 2)) items.push({ depth: x + y, kind: "tree", x, y, s });
    }
    const people = this.peopleToDraw(now, dt);
    for (const c of people) items.push({ depth: this.personDepth(c, items, lots), kind: "person", c });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) {
      if (it.kind === "tree") this.drawTree(it, now);
      else if (it.kind === "stop") this.drawStop(it.s, night);
      else if (it.kind === "building") this.drawBuilding(it.b, it.fp, dl, night, now);
      else if (it.kind === "person") this.drawPerson(it.c, night);
      else if (it.kind === "bridge") this.drawBridgeSprite(this.bridgeAt);
      else if (it.kind === "lot") this.drawLot(it.spr, it.fp, night);
      else if (it.kind === "works") this.drawWorks(it.works);
    }
    this.drawHaze(L, night, dl);
    this.drawWeather(wx, now, dl);
    this.drawRing(now);
    // Labels (UX 3.9): people first, then places, so place names move out of the way. Never under
    // the HUD, the bottom panels or the left column (they're claimed first). Always named: your
    // home, your workplace, the Next target and the selected place; then open everyday places in
    // view; everything once you zoom in past 2.6. At most 12 on a phone.
    this.placed = []; this.labelCount = 0;
    const ins = this.getInsets ? this.getInsets() : { top: 0, bottom: 0, left: 0 };
    if (ins.top) this.placed.push([-50, -50, cw + 100, ins.top + 50]);
    if (ins.bottom) this.placed.push([-50, ch - ins.bottom, cw + 100, ins.bottom + 50]);
    if (ins.left) this.placed.push([-50, -50, ins.left + 50, ch + 100]);
    for (const r of ins.blocks || []) this.placed.push(r);
    // Name plates above the heads (claimed first: place names move out of their way), then the
    // figures themselves kept clear of place names.
    const nameFont = `600 14px ${SERIF}`;
    ctx.font = nameFont;
    const hud = this.placed.slice();
    const underHud = (x, y, w, h) => hud.some(q => x < q[0] + q[2] && q[0] < x + w && y < q[1] + q[3] && q[1] < y + h);
    // You first, then whoever is selected, then the nearest: in a crowd the plates that find no free
    // spot close above their person are left out (zoom in, or tap someone, to see who they are).
    const isSel = c => this.selected && this.selected.kind === "person" && this.selected.id === c.id;
    const myPos = self ? this.shown.get(self.id) || [0, 0] : [0, 0];
    const order = people.filter(c => c.box).sort((a, b) => (b.self - a.self) || (isSel(b) - isSel(a)) || (dist([a.x, a.y], myPos) - dist([b.x, b.y], myPos)));
    for (const c of order) {
      const x = c.screen[0], lw = ctx.measureText(c.label).width + 12, want = c.box[1] - 17 - 3;
      const at = this.claim(x - lw / 2, want, lw, 17, [0, -1, -2]);
      const must = c.self || isSel(c);
      c.nameAt = at !== null ? [x - lw / 2, at, lw] : must && !underHud(x - lw / 2, want, lw, 17) ? [x - lw / 2, want, lw] : null;
    }
    for (const c of order) { const [x0, y0, x1, y1] = c.box; this.placed.push([x0, y0, x1 - x0, y1 - y0]); }
    this.plateHits(people);
    for (const c of people) if (c.bus && c.box) this.label("single-rider shuttle", c.x, c.y, 2.6 * ART_M + 1, false);
    const showAll = this.scale > 2.6, mePos = self ? this.standingPoint(self, now) : null, cap = cw < 700 ? 12 : 30;
    const marks = this.getMarks ? this.getMarks() : {}, mine = new Set([marks.home, ...(marks.work || []), marks.next].filter(Boolean));
    const isMine = b => mine.has(b.id) || (b.units || []).some(u => mine.has(u.id));
    const buildingLabel = (b, style) => {
      const fp = footprint(b), cx = (fp.x0 + fp.x1) / 2, cy = (fp.y0 + fp.y1) / 2, top = this.spriteTops.get(b.id);
      const placeholder = b.type === "civic" && b.enterable === false;
      const z = top === undefined ? fp.h + (b.type === "church" ? 24 : 4) : Math.max(fp.h + 4, (P(cx, cy)[1] - top) / this.scale + 1);
      const homeHere = marks.home && (b.id === marks.home || (b.units || []).some(u => u.id === marks.home));
      const work = (marks.work || []).includes(b.id);
      const name = homeHere ? `Home · ${b.name}` : work ? `Work · ${b.name}` : b.name + (placeholder ? " · placeholder landmark" : "");
      return this.label(name, cx, cy, z, style === "strong", homeHere ? "home" : work ? "work" : kindIcon(b.shape || b.type), style === "strong" ? null : style);
    };
    const insideB = self && self.inside ? w.buildingOfPlace.get(self.inside) : null;
    // Priority: selected, yours (home, work, Next), where you are, then the rest.
    const sel = b => this.selected && this.selected.kind === "place" && (this.selected.id === b.id || (b.units || []).some(u => u.id === this.selected.id));
    for (const b of w.buildings) if (sel(b)) buildingLabel(b, "strong");
    for (const b of w.buildings) if (!sel(b) && isMine(b)) buildingLabel(b, "mine");
    if (insideB && !sel(insideB) && !isMine(insideB)) buildingLabel(insideB, null);
    const rest = w.buildings.filter(b => !sel(b) && !isMine(b) && b !== insideB).map(b => ({ b, d: mePos ? dist(mePos, b.door) : 0 })).sort((a, b) => a.d - b.d);
    for (const { b, d } of rest) {
      if (this.labelCount >= cap) break;
      const open = b.status === "open", everyday = EVERYDAY.has(b.type);
      if (!(showAll || d < 45 || (everyday && open))) continue;
      buildingLabel(b, b.status === "closed" ? "muted" : null);
    }
    for (const pl of w.places) if (pl.type === "park" && this.labelCount < cap && (showAll || (mePos && dist(mePos, pl.door) < 60) || (this.selected && this.selected.id === pl.id))) this.label(pl.name, pl.door[0], pl.door[1], 6, this.selected && this.selected.id === pl.id, "park");
    for (const s of w.allStops()) {
      const isSel = this.selected && this.selected.kind === "stop" && this.selected.id === s.id;
      if (isSel || ((this.scale > 3.2 || (mePos && dist(mePos, s.at) < 40)) && this.labelCount < cap)) this.label(s.name, s.at[0], s.at[1], 9, isSel, "bus");
    }
    for (const c of order.slice().reverse()) if (c.nameAt) {
      ctx.font = nameFont; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const [nx, ny, lw] = c.nameAt;
      ctx.beginPath(); ctx.roundRect(nx, ny, lw, 17, 4);
      ctx.fillStyle = c.self ? "rgba(218,187,133,.97)" : c.scripted ? "rgba(30,56,48,.92)" : "rgba(11,43,35,.92)"; ctx.fill();
      ctx.lineWidth = 1;
      if (c.scripted) { ctx.setLineDash([2, 2]); ctx.strokeStyle = "rgba(247,236,214,.8)"; ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.strokeStyle = c.self ? "rgba(11,43,35,.5)" : "rgba(218,187,133,.55)"; ctx.stroke(); }
      ctx.fillStyle = c.self ? LOOK.emerald : LOOK.ivory; ctx.fillText(c.label, nx + lw / 2, ny + 9);
    }
    this.drawBubbles(people, now);
    this.drawFloaters(people, now);
  }

  // Where a person's speech and floaters go: above their name plate (or their head), centred on them.
  overHead(c) { return [c.screen[0], c.nameAt ? Math.min(c.nameAt[1], c.box[1]) : c.box[1]]; }
  // Floaters: a short word rising over someone's head, fading as it goes (static under reduced motion).
  drawFloaters(people, now) {
    if (!this.floaters.length) return;
    this.floaters = this.floaters.filter(f => now - f.at < FLOAT_MS);
    const pos = new Map(people.filter(p => p.box).map(p => [p.id, [...this.overHead(p), 0]]));
    const ctx = this.ctx;
    const seen = new Map();
    for (const f of this.floaters) {
      const sp = pos.get(f.who);
      if (!sp) continue;
      const k = (now - f.at) / FLOAT_MS, n = seen.get(f.who) || 0;
      seen.set(f.who, n + 1);
      const [x, y, r] = sp, rise = this.reduce ? 0 : 28 * k, a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `italic 600 ${f.self ? 17 : 16}px ${SERIF}`;
      const tw = ctx.measureText(f.text).width + 16, bx = Math.max(4, Math.min(this.cw - tw - 4, x - tw / 2)), by = y - r - 26 - rise - n * 24;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 22, 11);
      ctx.fillStyle = "rgba(11,43,35,.92)"; ctx.fill(); ctx.strokeStyle = LOOK.gold; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = LOOK.goldLight; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.text, bx + tw / 2, by + 11.5);
      ctx.globalAlpha = 1;
    }
  }

  // The ground: parchment, lawns, shadows, river, parks, roads, the bridge. With the owner's ground
  // textures, the flat part of it (parchment, lawns, parks, roads, the bridge's approach) is the
  // costliest thing on the map to draw, and it changes only with the zoom, the light (in steps), the
  // places, the projects and pictures arriving; so it's drawn into an offscreen canvas a margin
  // larger than the view and copied in, and re-drawn only when one of those changes or the view pans
  // past the margin. While a pinch or the wheel is still zooming, the last copy is stretched to the
  // new scale (re-drawn once the zoom settles, or sooner if it no longer covers the view). The shadows (they turn with the sun) and the river
  // (its glints move) are drawn over it every frame. Without the textures, everything is drawn
  // every frame in the hand-drawn order.
  drawGroundLayer(w, B, L, dl, grey, now) {
    this.bridgeAt = this.bridgeGeom();
    if (!["grass", "paving", "asphalt", "gravel"].some(id => this.tile(id))) {
      this.drawGround(B);
      this.drawYards(w.buildings);
      this.drawShadows(w.buildings, L, dl, grey);
      this.drawRiver(B, now);
      this.drawParks(w, true, true);
      this.drawRoads(w);
      if (this.bridgeAt) { this.drawBridgeApproach(); this.drawBridgeReflection(this.bridgeAt, B); }
      else this.drawBridge(B);
      return;
    }
    const flat = () => {
      this.drawGround(B);
      this.drawYards(w.buildings);
      this.drawParks(w, true, false);
      this.drawRoads(w);
      if (this.bridgeAt) this.drawBridgeApproach();
    };
    const zooming = this.scale !== this.groundScale;
    this.groundScale = this.scale;
    if (!((zooming && this.stretchGround(w)) || this.blitGround(w, flat))) flat();
    this.drawParks(w, false, true);
    this.drawShadows(w.buildings, L, dl, grey);
    this.drawRiver(B, now);
    if (this.bridgeAt) this.drawBridgeReflection(this.bridgeAt, B);
    else this.drawBridge(B);
  }
  // What the cached ground depends on, besides the zoom and the view.
  groundKey(w) {
    const L = this.light, roads = ROADS.map(r => (r.project && w.projects.get(r.project) || {}).status || "").join();
    return [this.dpr, this.cw, this.ch, quantize(L.amb), Math.round(L.amt * 48), Math.round(L.gold * 24), Math.round(this.dim * 48),
            Math.round(this.dl * 12), Math.round(this.night * 24), roads, this.loads].join("|");
  }
  // Mid-zoom: the cached ground scaled from its zoom to this one, if it still covers the view and the
  // zoom hasn't moved by more than a third. false: re-draw it.
  stretchGround(w) {
    const c = this.groundCache;
    if (!c || c.rest !== this.groundKey(w) || c.buildings !== w.buildings || c.places !== w.places) return false;
    const k = this.scale / c.scale, x0 = this.ox + k * (-c.mx - c.ox), y0 = this.oy + k * (-c.my - c.oy);
    if (k > 1.34 || k < 0.75) return false;   // too far from the zoom it was drawn at: re-draw it
    const x1 = this.ox + k * (this.cw + c.mx - c.ox), y1 = this.oy + k * (this.ch + c.my - c.oy);
    if (x0 > 0 || y0 > 0 || x1 < this.cw || y1 < this.ch) return false;
    // Unfiltered: it's on screen only while the zoom moves, and filtering a whole screen is slow.
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.canvas, x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true;
    return true;
  }
  // Copies the cached flat ground into the frame, re-drawing it first if it's stale or the view has
  // left it. false: no cache on a screen this big (the ground is drawn directly).
  blitGround(w, flat) {
    const dpr = this.dpr, rest = this.groundKey(w);
    let c = this.groundCache;
    const fresh = c && c.rest === rest && c.scale === this.scale && c.buildings === w.buildings && c.places === w.places && Math.abs(this.ox - c.ox) <= c.mx && Math.abs(this.oy - c.oy) <= c.my;
    if (!fresh) {
      // A margin of up to 30% each side, less on big high-density screens (at most ~10 Mpx).
      let m = 0.3;
      while (m > 0.08 && (this.cw * (1 + 2 * m)) * (this.ch * (1 + 2 * m)) * dpr * dpr > 10e6) m -= 0.04;
      if ((this.cw * (1 + 2 * m)) * (this.ch * (1 + 2 * m)) * dpr * dpr > 12e6) { this.groundCache = null; return false; }
      c = this.groundCache || (this.groundCache = { canvas: document.createElement("canvas") });
      c.mx = Math.ceil(this.cw * m); c.my = Math.ceil(this.ch * m);
      const cw = Math.round((this.cw + 2 * c.mx) * dpr), ch = Math.round((this.ch + 2 * c.my) * dpr);
      if (c.canvas.width !== cw || c.canvas.height !== ch) { c.canvas.width = cw; c.canvas.height = ch; }
      const g = c.canvas.getContext("2d"), main = this.ctx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
      g.setTransform(dpr, 0, 0, dpr, c.mx * dpr, c.my * dpr);
      this.ctx = g;
      try { flat(); } finally { this.ctx = main; }
      Object.assign(c, { rest, scale: this.scale, ox: this.ox, oy: this.oy, buildings: w.buildings, places: w.places });
    }
    const ctx = this.ctx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c.canvas, Math.round((this.ox - c.ox - c.mx) * dpr), Math.round((this.oy - c.oy - c.my) * dpr));
    ctx.restore();
    return true;
  }
  // Parks are ground: a lawn (the owner's grass once it has loaded), and for Willow Lake the lake and
  // its boardwalk. `paint` draws them; `hits` adds their tap targets (every frame, cached or not).
  drawParks(w, paint, hits) {
    const ctx = this.ctx, P = this.P.bind(this), L = this.light;
    for (const pl of w.places) {
      if (pl.type !== "park") continue;
      const shape = PARK_SHAPES[pl.id] || { rx: 30, ry: 28 }, [cx, cy] = pl.door, lawn = [], inner = [];
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        lawn.push(P(cx + Math.cos(a) * shape.rx, cy + Math.sin(a) * shape.ry));
        inner.push(P(cx + Math.cos(a) * shape.rx * 0.72, cy + Math.sin(a) * shape.ry * 0.72));
      }
      if (hits) this.hit.push({ kind: "park", id: pl.id, poly: lawn });
      if (!paint) continue;
      const grass = this.groundTexture("grass", TILE_METERS.grass, 1.05);
      if (grass) { ctx.lineWidth = Math.max(1, 0.5 * this.scale); this.poly(lawn, this.laid(grass), rgba(this.lit(LOOK.stone[1]), 0.7)); }
      else { this.poly(lawn, this.lit(LOOK.lawn[1], 1.05)); this.poly(inner, this.lit(LOOK.lawn[0], 1.05)); }
      if (PARK_ART[pl.id] && this.sprite(pl.id)) continue;   // the park's own picture has its lake
      if (shape.lake) {
        const lake = []; for (let a = 0; a < Math.PI * 2; a += 0.2) lake.push(P(cx + Math.cos(a) * shape.lake.rx, cy + Math.sin(a) * shape.lake.ry));
        ctx.lineWidth = Math.max(1, 1.2 * this.scale);
        this.poly(lake, this.lit(mix(LOOK.water[0], LOOK.glassGold, L.gold * 0.3)), this.lit(LOOK.stone[0]));
      }
      if (shape.boardwalk) {
        ctx.strokeStyle = this.lit("#b08a5c"); ctx.lineWidth = Math.max(1, 1.6 * this.scale);
        ctx.beginPath(); ctx.moveTo(...P(cx + shape.boardwalk[0][0], cy + shape.boardwalk[0][1])); ctx.lineTo(...P(cx + shape.boardwalk[1][0], cy + shape.boardwalk[1][1])); ctx.stroke();
      }
    }
  }

  // The sketch's trees plus the street trees that fit around this map's buildings and stops.
  treesFor(w) {
    const c = this.treeCache;
    if (c && c.buildings === w.buildings && c.transit === w.transit) return c.list;
    const parks = w.places.filter(p => p.type === "park");
    this.treeCache = { buildings: w.buildings, transit: w.transit, list: TREES.concat(streetTrees(w.buildings, w.allStops(), parks)) };
    return this.treeCache.list;
  }

  // ------------------------------------------------------------------ the ground layer
  drawGround(B) {
    const ctx = this.ctx, P = this.P.bind(this), { x0: rx0, x1: rx1, depth } = RIVER, T = 9;
    // The map's cut edges (south and east), so the town reads as a model on its table.
    const riverEast = rx1 >= B.max[0];
    this.poly([P(B.min[0], B.max[1], 0), P(rx0, B.max[1], 0), P(rx0, B.max[1], -T), P(B.min[0], B.max[1], -T)], this.lit(LOOK.slab[0], 1.1));
    this.poly([P(rx0, B.max[1], -depth), P(B.max[0], B.max[1], -depth), P(B.max[0], B.max[1], -T), P(rx0, B.max[1], -T)], this.lit(mix(LOOK.slab[0], LOOK.water[1], 0.35), 1.1));
    this.poly([P(B.max[0], B.min[1], riverEast ? -depth : 0), P(B.max[0], B.max[1], riverEast ? -depth : 0), P(B.max[0], B.max[1], -T), P(B.max[0], B.min[1], -T)], this.lit(LOOK.slab[1], 1.1));
    // Parchment.
    const gr = this.lit(LOOK.ground[0], 1.1);
    this.poly([P(B.min[0], B.min[1]), P(rx0, B.min[1]), P(rx0, B.max[1]), P(B.min[0], B.max[1])], gr);
    if (!riverEast) this.poly([P(rx1, B.min[1]), P(B.max[0], B.min[1]), P(B.max[0], B.max[1]), P(rx1, B.max[1])], gr);
    // A faint 50 m grid, like the survey lines on a parchment map.
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(120,96,60,${(0.05 + 0.02 * this.night).toFixed(3)})`;
    ctx.beginPath();
    for (let x = B.min[0]; x <= Math.min(B.max[0], rx0); x += 50) { ctx.moveTo(...P(x, B.min[1])); ctx.lineTo(...P(x, B.max[1])); }
    for (let y = B.min[1]; y <= B.max[1]; y += 50) { ctx.moveTo(...P(B.min[0], y)); ctx.lineTo(...P(Math.min(B.max[0], rx0), y)); }
    ctx.stroke();
  }

  // Sage lawns around homes, civic buildings and brick ones; a pale stone plaza around the glass towers.
  drawYards(buildings) {
    if (this.scale < 0.3) return;
    const P = this.P.bind(this), lawn = this.surface("grass", LOOK.lawn[0], 1.05), plaza = this.surface("paving", LOOK.stone[0], 1.05), ctx = this.ctx;
    for (const b of buildings) {
      if (b.status === "under_construction") continue;
      const fp = footprint(b), kind = fp.pal === "glass" ? plaza : ["home", "civic", "brick"].includes(fp.pal) ? lawn : null;
      if (!kind || b.shape === "street_corner" || this.sprite(b.id)) continue;
      const m = fp.h > 30 ? 7 : 5;
      ctx.lineWidth = 1;
      this.poly([P(fp.x0 - m, fp.y0 - m), P(fp.x1 + m, fp.y0 - m), P(fp.x1 + m, fp.y1 + 3), P(fp.x0 - m, fp.y1 + 3)], kind, rgba(this.lit(LOOK.stone[1]), 0.6));
    }
  }

  // Soft shadows on the ground: the sun swings from the east at dawn through the south to the west
  // at dusk, and shadows lengthen toward golden hour.
  drawShadows(buildings, L, dl, grey) {
    const a = dl * (1 - grey);
    if (a < 0.05 || this.scale < 0.3) return;
    const ang = Math.max(-1.35, Math.min(1.35, (L.hour - 12) / 6 * Math.PI / 2));
    const k = Math.min(2.4, 0.45 / Math.max(0.2, Math.cos(ang))), dx = Math.sin(ang), dy = -Math.cos(ang);
    const ctx = this.ctx, P = this.P.bind(this);
    ctx.beginPath();
    for (const b of buildings) {
      if (b.status === "under_construction") continue;
      const fp = footprint(b);
      if (!fp.h || fp.pal === "field" || fp.pal === "court") continue;
      const len = Math.min(70, (this.sprite(b.id) ? Math.max(fp.h, 12) : fp.h) * k), sx = dx * len, sy = dy * len;
      const corners = [[fp.x0, fp.y0], [fp.x1, fp.y0], [fp.x1, fp.y1], [fp.x0, fp.y1]];
      const pts = hull(corners.concat(corners.map(([x, y]) => [x + sx, y + sy])));
      pts.forEach(([x, y], i) => { const [px, py] = P(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath();
    }
    ctx.fillStyle = rgba(mix("#6e5536", "#7a4a4e", L.gold), 0.16 * a);
    ctx.fill("nonzero");
  }

  // The river: blue-teal water sunk below a cream stone embankment, with golden glints at golden
  // hour and the lights of the quay and the bridge in it at night.
  drawRiver(B, now) {
    const ctx = this.ctx, P = this.P.bind(this), L = this.light, { x0, x1, depth: d, promenade } = RIVER, y0 = B.min[1], y1 = B.max[1];
    const xe = Math.min(x1, B.max[0]);
    const gk = L.gold * 0.8;
    const near = this.lit(mix(LOOK.water[0], LOOK.waterGold[0], gk), 0.9), far = this.lit(mix(mix(LOOK.water[1], L.low, 0.2), LOOK.waterGold[1], gk), 0.9);
    const [ax, ay] = P(x0, y1, -d), [bx, by] = P(xe, y0, -d);
    const wg = ctx.createLinearGradient(ax, ay, bx, by);
    wg.addColorStop(0, near); wg.addColorStop(1, far);
    this.poly([P(x0, y0, -d), P(xe, y0, -d), P(xe, y1, -d), P(x0, y1, -d)], wg);
    // Glints: pale ripples by day, gold streaks at golden hour.
    const reduce = this.reduce, t = reduce ? 0 : now / 1000;
    const goldA = 0.95 * L.gold * (1 - this.night * 0.6), whiteA = 0.24 * this.dl * (1 - L.gold);
    if (goldA > 0.02 || whiteA > 0.02) {
      ctx.lineCap = "round";
      for (const [gx, gy, len, ph] of this.glints) {
        const y = y0 + gy * (y1 - y0), sway = reduce ? 0 : Math.sin(t * 0.8 + ph) * 2.5, s = reduce ? 1 : 0.55 + 0.45 * Math.sin(t * 1.3 + ph * 2);
        if (goldA > 0.02) { ctx.strokeStyle = rgba("#ffe3a8", goldA * s); ctx.lineWidth = Math.max(1, 0.8 * this.scale); }
        else { ctx.strokeStyle = rgba("#ffffff", whiteA * s); ctx.lineWidth = 1; }
        ctx.beginPath(); ctx.moveTo(...P(gx + sway, y, -d)); ctx.lineTo(...P(Math.min(xe - 2, gx + len + sway), y + len * 0.15, -d)); ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    // The embankment wall, the waterline, and the promenade along the quay.
    const stone = LOOK.stone;
    this.poly([P(x0, y0, 0), P(x0, y1, 0), P(x0, y1, -d), P(x0, y0, -d)], this.lit(stone[1]));
    ctx.strokeStyle = rgba(this.lit("#6d5a3e"), 0.35); ctx.lineWidth = Math.max(1, 0.6 * this.scale);
    ctx.beginPath(); ctx.moveTo(...P(x0, y0, -d + 0.6)); ctx.lineTo(...P(x0, y1, -d + 0.6)); ctx.stroke();
    this.poly([P(x0 - promenade, y0), P(x0, y0), P(x0, y1), P(x0 - promenade, y1)], this.surface("paving", stone[0]));
    ctx.strokeStyle = this.lit(stone[2]); ctx.lineWidth = Math.max(1, 0.5 * this.scale);
    ctx.beginPath(); ctx.moveTo(...P(x0 - promenade, y0)); ctx.lineTo(...P(x0 - promenade, y1)); ctx.stroke();
    // Balustrade: a rail on posts along the water's edge.
    ctx.strokeStyle = this.lit(LOOK.ivory, 0.9); ctx.lineWidth = Math.max(1, 0.45 * this.scale);
    ctx.beginPath(); ctx.moveTo(...P(x0 - 0.6, y0, 1.1)); ctx.lineTo(...P(x0 - 0.6, y1, 1.1));
    if (this.scale > 0.8) for (let y = y0; y <= y1; y += 5) { ctx.moveTo(...P(x0 - 0.6, y, 0)); ctx.lineTo(...P(x0 - 0.6, y, 1.1)); }
    ctx.stroke();
  }

  // Roads: warm grey asphalt on pale kerbs with cream dashes. A road still being paved is gravel
  // until the city says it's complete. With the owner's tiles the asphalt, the kerbs' slabs and the
  // gravel are textured (the gravel's wheel ruts run along the road), the centre line breaks at
  // every junction instead of running through it, and where a paved road meets a road still being
  // paved, the gravel goes through.
  drawRoads(w) {
    const ctx = this.ctx, P = this.P.bind(this), path = r => { ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(...P(...p)) : ctx.moveTo(...P(...p))); };
    const paving = r => { const proj = r.project && w.projects.get(r.project); return !!(proj && proj.status !== "complete"); };
    const asphalt = this.groundTexture("asphalt", TILE_METERS.asphalt), gravel = this.groundTexture("gravel", ROAD_W);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = this.surface("paving", LOOK.kerb); ctx.lineWidth = Math.max(3, 14.5 * this.scale * 0.9);
    for (const r of ROADS) { path(r); ctx.stroke(); }
    for (const r of ROADS) {
      const unpaved = paving(r);
      ctx.strokeStyle = unpaved ? (gravel ? this.gravelAlong(gravel, r) : this.lit(LOOK.gravel)) : asphalt ? this.laid(asphalt) : this.lit(LOOK.road);
      ctx.lineWidth = Math.max(2, 11 * this.scale * 0.9);
      path(r); ctx.stroke();
      if (unpaved) {
        if (gravel) continue;
        ctx.strokeStyle = rgba(this.lit("#8a7150"), 0.45); ctx.lineWidth = Math.max(1, 0.7 * this.scale); ctx.setLineDash([1, 3.5 * this.scale]);
        path(r); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = rgba(this.lit(LOOK.dash, 0.8), 0.75 + 0.2 * this.dl); ctx.lineWidth = Math.max(0.6, 0.6 * this.scale); ctx.setLineDash([6 * this.scale, 6 * this.scale]);
        if (asphalt) this.centreLine(r);
        else { path(r); ctx.stroke(); }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }
    if (gravel) for (const j of JUNCTIONS) if (j.through && paving(j.through)) {
      const h = ROAD_W / 2;
      this.poly([P(j.x - h, j.y - h), P(j.x + h, j.y - h), P(j.x + h, j.y + h), P(j.x - h, j.y + h)], this.gravelAlong(gravel, j.through));
    }
    ctx.lineCap = "butt";
  }
  // The gravel texture across this road's width, its ruts along the road.
  gravelAlong(g, r) {
    const [[ax, ay], [bx, by]] = r.pts, len = Math.hypot(bx - ax, by - ay) || 1, t = [(bx - ax) / len, (by - ay) / len], n = [-t[1], t[0]];
    return this.laid(g, ax - n[0] * ROAD_W / 2, ay - n[1] * ROAD_W / 2, n, t);
  }
  // A road's dashed centre line in pieces, stopping short of every junction on it. Each piece
  // keeps the dashes' phase along the whole road, so they don't jump.
  centreLine(r) {
    const ctx = this.ctx, P = this.P.bind(this), s = this.scale, [[ax, ay], [bx, by]] = r.pts, len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len, gap = ROAD_W / 2 + 2, cuts = [];
    for (const j of JUNCTIONS) if (j.roads.includes(r)) { const t = (j.x - ax) * ux + (j.y - ay) * uy; cuts.push([t - gap, t + gap]); }
    cuts.sort((p, q) => p[0] - q[0]);
    let t0 = 0;
    const piece = t1 => {
      if (t1 - t0 > 2) {
        ctx.lineDashOffset = t0 * s;
        ctx.beginPath(); ctx.moveTo(...P(ax + ux * t0, ay + uy * t0)); ctx.lineTo(...P(ax + ux * t1, ay + uy * t1)); ctx.stroke();
      }
    };
    for (const [c0, c1] of cuts) { piece(Math.min(len, c0)); t0 = Math.max(t0, c1); }
    piece(len);
  }

  // The arched stone bridge on Lexington Avenue's line (sketch decoration): back face, the arches'
  // undersides, the deck, parapets and lamps, then the front face with its arches.
  drawBridge(B) {
    const ctx = this.ctx, P = this.P.bind(this), L = this.light, R = RIVER, { y, x0, width, arches, pier, rise } = BRIDGE;
    const x1 = Math.min(BRIDGE.x1, B.max[0]), d = R.depth, yb = y - width / 2, yf = y + width / 2, wx0 = R.x0, wx1 = Math.min(R.x1, x1);
    const span = (wx1 - wx0 - pier * (arches - 1)) / arches, stone = LOOK.stone;
    const arch = i => [wx0 + i * (span + pier), wx0 + i * (span + pier) + span];
    const curve = (a, b, yy, rev) => {
      const out = [];
      for (let k = 0; k <= 14; k++) { const t = rev ? 1 - k / 14 : k / 14, u = 2 * t - 1; out.push(P(a + (b - a) * t, yy, -d + rise * Math.sqrt(Math.max(0, 1 - u * u)))); }
      return out;
    };
    const face = yy => {
      const pts = [P(wx0, yy, 0), P(wx1, yy, 0), P(wx1, yy, -d)];
      for (let i = arches - 1; i >= 0; i--) { const [a, b] = arch(i); pts.push(P(b, yy, -d), ...curve(a, b, yy, true), P(a, yy, -d)); }
      return pts;
    };
    // Its reflection in the water, faint and warm.
    const refl = [];
    for (let i = 0; i < arches; i++) {
      const [a, b] = arch(i);
      refl.push(P(a, yf, -d));
      for (let k = 0; k <= 14; k++) { const t = k / 14, u = 2 * t - 1; refl.push(P(a + (b - a) * t, yf, -d - rise * Math.sqrt(Math.max(0, 1 - u * u)))); }
      refl.push(P(b, yf, -d), P(b + (i < arches - 1 ? pier : 0), yf, -d));
    }
    refl.push(P(wx1, yf, -d), P(wx1, yf, -2 * d - 1.3), P(wx0, yf, -2 * d - 1.3));
    this.poly(refl, rgba(this.lit(mix(stone[1], LOOK.glassGold, L.gold * 0.5)), 0.22 + 0.12 * L.gold));
    this.poly(face(yb), this.lit(stone[2], 1.1));
    for (let i = 0; i < arches; i++) {
      const [a, b] = arch(i);
      this.poly([...curve(a, b, yf, false), ...curve(a, b, yb, true)], this.lit(mix(stone[2], "#6b5639", 0.35), 1.1));
    }
    // The deck carries Lexington Avenue on to the edge of the map.
    ctx.lineCap = "butt";
    this.poly([P(x0, yb + 0.8), P(x1, yb + 0.8), P(x1, yf - 0.8), P(x0, yf - 0.8)], this.lit(LOOK.road));
    ctx.strokeStyle = rgba(this.lit(LOOK.dash, 0.8), 0.75 + 0.2 * this.dl); ctx.lineWidth = Math.max(0.6, 0.6 * this.scale); ctx.setLineDash([6 * this.scale, 6 * this.scale]);
    ctx.beginPath(); ctx.moveTo(...P(x0, y)); ctx.lineTo(...P(x1, y)); ctx.stroke(); ctx.setLineDash([]);
    const parapet = [this.lit(stone[0]), this.lit(stone[1]), this.lit(stone[2])];
    const lamps = [wx0 - 1.5, ...Array.from({ length: arches - 1 }, (_, i) => arch(i)[1] + pier / 2), wx1 - 1.5];
    const lamp = (lx, ly) => {
      ctx.strokeStyle = this.lit("#3a3a34", 0.6); ctx.lineWidth = Math.max(1, 0.35 * this.scale);
      ctx.beginPath(); ctx.moveTo(...P(lx, ly, 1.3)); ctx.lineTo(...P(lx, ly, 5)); ctx.stroke();
      const [hx, hy] = P(lx, ly, 5.2);
      ctx.fillStyle = this.night > 0.25 ? "#ffe2a6" : this.lit(LOOK.ivory, 0.8); ctx.beginPath(); ctx.arc(hx, hy, Math.max(1.2, 0.55 * this.scale), 0, Math.PI * 2); ctx.fill();
    };
    this.drawBox({ x0: wx0 - 3, x1, y0: yb, y1: yb + 0.8, h: 1.3 }, parapet, {});
    for (const lx of lamps) lamp(lx, yb + 0.4);
    this.poly(face(yf), this.lit(stone[1]));
    ctx.strokeStyle = rgba(this.lit(LOOK.gold, 0.5), 0.8); ctx.lineWidth = Math.max(0.6, 0.3 * this.scale);
    ctx.beginPath(); ctx.moveTo(...P(wx0, yf, -0.4)); ctx.lineTo(...P(wx1, yf, -0.4)); ctx.stroke();
    this.drawBox({ x0: wx0 - 3, x1, y0: yf - 0.8, y1: yf, h: 1.3 }, parapet, {});
    for (const lx of lamps) lamp(lx, yf - 0.4);
    this.bridgeLamps = lamps;
  }

  // The owner's bridge picture, placed so its deck runs on Lexington Avenue's line from the quay to
  // the east edge: two points on the deck's centre line, measured on the art (tiles/manifest.json),
  // go to their places on the map. The art is a 2:1 isometric and the map a 30° one, so it comes
  // out a little taller than a drawn bridge would; heights are a sketch anyway. null until loaded.
  bridgeGeom() {
    const t = this.tile("bridge"), a = t && t.info.kind === "sprite" ? t.info.anchors : null;
    if (!a || !a.west || !a.east) return null;
    const z = BRIDGE_ART.z, [wx, wy] = this.P(BRIDGE_ART.x0, BRIDGE.y, z), [ex, ey] = this.P(BRIDGE_ART.x1, BRIDGE.y, z);
    const W = (ex - wx) / (a.east[0] - a.west[0]), H = (ey - wy) / (a.east[1] - a.west[1]);
    if (!(W > 0 && H > 0)) return null;
    const x = wx - a.west[0] * W, y = wy - a.west[1] * H, at = p => [x + p[0] * W, y + p[1] * H];
    // The line where the front piers stand in the water: the picture's reflection flips about it.
    const water = a.water_west && a.water_east ? [at(a.water_west), at(a.water_east)] : null;
    return { t, x, y, W, H, at, water, lamps: t.info.lamps.map(at) };
  }
  // A paved approach from River Road to the bridge picture's deck, up to the quay's promenade.
  drawBridgeApproach() {
    const P = this.P.bind(this), hw = 8, x0 = BRIDGE_ART.approach + KERB_W / 2, x1 = RIVER.x0 - RIVER.promenade, y = BRIDGE.y;
    this.ctx.lineWidth = Math.max(1, 0.5 * this.scale);
    this.poly([P(x0, y - hw), P(x1, y - hw), P(x1, y + hw), P(x0, y + hw)], this.surface("paving", LOOK.stone[0]), rgba(this.lit(LOOK.stone[2]), 0.8));
  }
  // The bridge picture's reflection in the river: flipped about its waterline, faint, clipped to the water.
  drawBridgeReflection(g, B) {
    const ctx = this.ctx, P = this.P.bind(this), R = RIVER;
    this.bridgeLamps = null;
    if (!g.water || g.x > this.cw || g.x + g.W < 0) return;
    const [[ax, ay], [bx, by]] = g.water, k = (by - ay) / (bx - ax), c = ay - k * ax, d = R.depth, xe = Math.min(R.x1, B.max[0]);
    ctx.save();
    this.poly([P(R.x0, B.min[1], -d), P(xe, B.min[1], -d), P(xe, B.max[1], -d), P(R.x0, B.max[1], -d)], null);
    ctx.clip();
    // (x, y) -> (x, 2(kx + c) - y): a mirror about the waterline y = kx + c.
    ctx.transform(1, 2 * k, 0, -1, 0, 2 * c);
    ctx.globalAlpha = 0.16 + 0.1 * this.light.gold;
    ctx.drawImage(this.bakedSprite(g.t, g.W), g.x, g.y, g.W, g.H);
    ctx.restore();
  }
  drawBridgeSprite(g) {
    if (!g || g.x > this.cw + 20 || g.x + g.W < -20 || g.y > this.ch + 20 || g.y + g.H < -20) return;
    this.ctx.drawImage(this.bakedSprite(g.t, g.W), g.x, g.y, g.W, g.H);
    const on = clamp01((this.night - 0.15) / 0.5);
    if (on > 0) for (const [lx, ly] of g.lamps) this.glow(lx, ly, Math.max(4, g.W * 0.025), 0.8 * on);
  }

  // What glows on the ground after dark: pools of lamplight along the roads, the bridge's lamps
  // and their reflections in the river.
  drawGroundLights(w, now) {
    const on = clamp01((this.night - 0.15) / 0.5);
    if (on <= 0) return;
    const P = this.P.bind(this), s = this.scale;
    for (const r of ROADS) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1], len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(len / 34));
        for (let k = 0; k <= n; k++) { const [px, py] = P(ax + (bx - ax) * k / n, ay + (by - ay) * k / n); this.glow(px, py, 11 * s, 0.32 * on, 0.55); }
      }
    }
    const { y, width } = BRIDGE, d = RIVER.depth;
    for (const lx of this.bridgeLamps || []) for (const ly of [y - width / 2 + 0.4, y + width / 2 - 0.4]) {
      const [hx, hy] = P(lx, ly, 5.2); this.glow(hx, hy, 5 * s, 0.85 * on);
    }
    // Reflections: gold streaks in the water under the front lamps.
    const ctx = this.ctx, reduce = this.reduce, t = reduce ? 0 : now / 1000;
    const g = this.bridgeAt;
    if (g && g.water) {
      // The picture's front lamps (the first five in the manifest), mirrored about its waterline.
      const [[ax, ay], [bx, by]] = g.water, k = (by - ay) / (bx - ax);
      g.lamps.slice(0, 5).forEach(([lx, ly], i) => {
        const ry = 2 * (ay + k * (lx - ax)) - ly, f = reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 2.4 + i * 1.3);
        this.glow(lx, ry, Math.max(3, g.W * 0.012), 0.7 * on * f, 3.6);
      });
    }
    ctx.lineCap = "round";
    for (const lx of this.bridgeLamps || []) {
      const [rx, ry] = P(lx, y + width / 2, -d - 7), k = reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 2.4 + lx);
      this.glow(rx, ry, 2.2 * s, 0.75 * on * k, 3.6);
    }
    ctx.lineCap = "butt";
  }

  // Line 1 as on the route poster: a gold loop through the stops in their order on the line,
  // closing back to the first, with small arrows for the direction of travel.
  drawRoutes(w) {
    if (!w.transit || !w.transit.length) return;
    if (this.routeCache.transit !== w.transit) {
      this.routeCache = { transit: w.transit, loops: w.transit.filter(l => l.stops.length > 1).map(l => loopThrough(l.stops.map(s => s.at))) };
    }
    const ctx = this.ctx, P = this.P.bind(this), s = this.scale, night = this.night;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const loop of this.routeCache.loops) {
      const pts = loop.map(p => P(p[0], p[1]));
      const stroke = (style, width) => { ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke(); };
      if (night > 0.2) stroke(`rgba(232,207,156,${(0.3 * night).toFixed(3)})`, Math.max(8, 7 * s));
      stroke(night > 0.5 ? "#b8893f" : "#a77b3a", Math.max(3.5, 3.4 * s));
      stroke(night > 0.5 ? "#e8cf9c" : "#d9b673", Math.max(2.2, 2.3 * s));
      stroke(night > 0.5 ? "#fbefd2" : "#f3e0b5", Math.max(0.8, 0.6 * s));
      // Direction arrows, between the stops.
      if (s > 0.6) {
        ctx.fillStyle = LOOK.ivory;
        for (let i = 7; i < pts.length; i += 14) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[(i + 1) % pts.length], [cx, cy] = pts[i], a = Math.atan2(by - ay, bx - ax), r = Math.max(2.4, 1.5 * s);
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          ctx.lineTo(cx + Math.cos(a + 2.5) * r, cy + Math.sin(a + 2.5) * r); ctx.lineTo(cx + Math.cos(a - 2.5) * r, cy + Math.sin(a - 2.5) * r); ctx.closePath(); ctx.fill();
        }
      }
    }
    ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  }

  // Atmosphere: a warm haze toward the horizon at golden hour, champagne light by day, emerald dusk at night.
  drawHaze(L, night, dl) {
    const ctx = this.ctx, cw = this.cw, ch = this.ch;
    const g = ctx.createLinearGradient(0, 0, 0, ch * 0.6);
    if (L.gold > 0.03) {
      g.addColorStop(0, rgba("#f3c9a8", 0.26 * L.gold)); g.addColorStop(0.6, rgba("#fce5ba", 0.1 * L.gold)); g.addColorStop(1, "rgba(252,229,186,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch * 0.6);
    } else if (night > 0.3) {
      g.addColorStop(0, rgba("#03111a", 0.4 * night)); g.addColorStop(0.9, "rgba(3,17,26,0)"); g.addColorStop(1, "rgba(3,17,26,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch * 0.6);
    } else if (dl > 0.5) {
      g.addColorStop(0, rgba("#fff3dc", 0.16 * dl)); g.addColorStop(0.85, "rgba(255,243,220,0)"); g.addColorStop(1, "rgba(255,243,220,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch * 0.6);
    }
  }

  // How tall a 1.75 m person stands on the map at this zoom, in CSS pixels. True scale makes a person
  // about 8 px tall at the default zoom, a speck under their name; like most isometric games, people are
  // drawn larger than the buildings would make them (up to 3x, at least MIN_PERSON_PX) until zooming in
  // reaches true scale. A sketch choice for readability, not a fact about anyone's height.
  personHeight() {
    const real = PERSON_M * ART_M * this.scale;
    return Math.max(real, Math.min(MIN_PERSON_PX, real * 3));
  }
  peopleToDraw(now, dt) {
    const w = this.world, out = [], P = this.P.bind(this), stride = this.personHeight() * WALK_CYCLE_HEIGHTS;
    const add = (e, isSelf) => {
      const truth = this.standingPoint(e, now);
      if (!truth) return;
      let s = this.shown.get(e.id);
      const was = s;
      if (!s || dist(s, truth) > 40) s = truth.slice();
      else { const k = 1 - Math.exp(-dt * 12); s = [s[0] + (truth[0] - s[0]) * k, s[1] + (truth[1] - s[1]) * k]; }
      this.shown.set(e.id, s);
      // Facing and the walk: from where they're heading on screen; standing still, the way they last went.
      let g = this.gait.get(e.id);
      if (!g) { g = { phase: 0, facing: "front", mirror: false }; this.gait.set(e.id, g); }
      const bus = e.mode === "bus" && !!e.target, here = predict(e, now);
      const walking = !e.inside && !bus && !!e.target && e.speed > 0 && dist(here, e.target) > 0.05;
      if (walking) {
        const [ax, ay] = P(here[0], here[1]), [bx, by] = P(e.target[0], e.target[1]), f = facingFor(bx - ax, by - ay, g);
        g.facing = f.facing; g.mirror = f.mirror;
        // The steps follow how fast they move on screen against how big they're drawn (D-072): one cycle, two
        // steps, per WALK_CYCLE_HEIGHTS of their drawn height covered, so the feet keep pace with the ground
        // whatever the clock's speed or the zoom; kept between a stroll and a run's cadence so it still reads.
        const [px, py] = was ? P(was[0], was[1]) : [0, 0], [qx, qy] = was ? P(s[0], s[1]) : [0, 0];
        const cycles = Math.hypot(qx - px, qy - py) / Math.max(1, stride);
        g.phase = (g.phase + Math.max(dt * WALK_CADENCE[0], Math.min(dt * WALK_CADENCE[1], cycles))) % 1;
      }
      const name = isSelf ? "You" : firstName(e.name) + (e.scripted ? " · script" : "");
      out.push({ id: e.id, x: s[0], y: s[1], inside: e.inside, self: isSelf, scripted: !!e.scripted, name: e.name, label: name,
                 bus, walking, gait: g, person: e });
    };
    if (w.self) add(w.self, true);
    for (const p of w.people.values()) add(p, false);
    for (const id of [...this.shown.keys()]) if (id !== w.selfId && !w.people.has(id)) { this.shown.delete(id); this.gait.delete(id); }
    // Screen-space fan-out: people standing on the same spot (everyone inside one building stands
    // at its door) stand side by side instead of on top of each other.
    const ph = this.personHeight(), gap = ph * 0.34 + 3, clusters = [];
    for (const c of out) {
      [c.sx0, c.sy0] = P(c.x, c.y, 0);
      const cl = clusters.find(k => Math.hypot(k[0].sx0 - c.sx0, k[0].sy0 - c.sy0) < gap);
      cl ? cl.push(c) : clusters.push([c]);
    }
    for (const cl of clusters) cl.forEach((c, i) => { c.dx = (i - (cl.length - 1) / 2) * gap; c.dy = cl[0].sy0 - c.sy0; });
    return out;
  }
  // Where a person comes in the back-to-front order. Their own depth (x + y) puts them behind a
  // building whose front corner is further forward, so someone standing on the pavement in front of
  // a building's south or east face (or at its door) is moved just in front of that building, and
  // someone on a picture laid on the ground (a park's, the road works) just in front of the picture.
  personDepth(c, items, lots) {
    let d = c.x + c.y;
    for (const it of items) {
      if (it.kind === "building") {
        const f = it.fp;
        const south = c.y >= f.y1 - 0.5 && c.y <= f.y1 + 40 && c.x >= f.x0 - 16 && c.x <= f.x1 + 16;
        const east = c.x >= f.x1 - 0.5 && c.x <= f.x1 + 40 && c.y >= f.y0 - 16 && c.y <= f.y1 + 16;
        if (south || east) d = Math.max(d, it.depth + 0.01);
      } else if (it.kind === "lot" || it.kind === "works") {
        const l = it.kind === "lot" ? it.fp : it.works.lot;
        if (c.x > l.x0 - 2 && c.x < l.x1 + 2 && c.y > l.y0 - 2 && c.y < l.y1 + 2) d = Math.max(d, it.depth + 0.01);
      }
    }
    return d;
  }

  // One tree (shadow, trunk, canopy) drawn into a sprite for this light and zoom; every tree
  // stamps it at its own size. Redrawn only when the light or the zoom bucket changes.
  treeSprite() {
    const cols = LOOK.tree.map(c => this.lit(c)), trunk = this.lit(LOOK.trunk), shade = 0.16 * this.dl;
    const U = Math.max(16, Math.min(112, Math.ceil(9 * this.scale * this.dpr / 8) * 8));
    const key = `${cols.join()}${trunk}${shade.toFixed(2)}${U}`;
    if (this.treeSpr && this.treeSpr.key === key) return this.treeSpr.canvas;
    const c = (this.treeSpr && this.treeSpr.canvas) || document.createElement("canvas");
    c.width = Math.ceil(3 * U); c.height = Math.ceil(3.4 * U);
    const g = c.getContext("2d"), bx = 1.5 * U, by = 2.95 * U, r = 0.95 * U, tx = bx, ty = by - 1.9 * U;
    g.clearRect(0, 0, c.width, c.height);
    if (shade > 0.01) { g.fillStyle = rgba("#6e5536", shade); g.beginPath(); g.ellipse(bx + r * 0.35, by, r * 0.95, r * 0.42, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = trunk; g.lineWidth = 0.14 * U; g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty + r * 0.4); g.stroke();
    g.fillStyle = cols[0];
    g.beginPath(); g.arc(tx - r * 0.38, ty + r * 0.12, r * 0.74, 0, Math.PI * 2); g.moveTo(tx + r * 1.1, ty + r * 0.16); g.arc(tx + r * 0.38, ty + r * 0.16, r * 0.72, 0, Math.PI * 2); g.fill();
    g.fillStyle = cols[1]; g.beginPath(); g.arc(tx, ty - r * 0.18, r * 0.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.arc(tx - r * 0.24, ty - r * 0.42, r * 0.42, 0, Math.PI * 2); g.fill();
    this.treeSpr = { key, canvas: c };
    return c;
  }
  // A rounded, lush sage canopy; after dark some trees carry tiny warm lights.
  drawTree(it, now) {
    const ctx = this.ctx, s = this.scale, u = Math.max(2.6, it.s * s), [bx, by] = this.P(it.x, it.y, 0);
    if (bx < -3 * u || bx > this.cw + 3 * u || by < -u || by > this.ch + 4 * u) return;
    ctx.drawImage(this.treeSprite(), bx - 1.5 * u, by - 2.95 * u, 3 * u, 3.4 * u);
    const r = 0.95 * u, tx = bx, ty = by - 1.9 * u;
    // Fairy lights in about half the trees, from dusk; they twinkle unless motion is reduced.
    const on = clamp01((this.night - 0.12) / 0.45);
    const seed = (Math.round(it.x * 7) * 73856093 ^ Math.round(it.y * 7) * 19349663) >>> 0;
    if (on > 0 && seed % 2 === 0) {
      const reduce = this.reduce, t = reduce ? 0 : now / 1000;
      if (s > 1.2) this.glow(tx, ty, r * 1.6, 0.22 * on);
      const lr = Math.max(1, 0.45 * s);
      ctx.fillStyle = "#ffe0a0";
      for (let i = 0; i < 4; i++) {
        const a = ((seed >> (i * 5)) % 360) * Math.PI / 180, d = r * (0.3 + ((seed >> (i * 3 + 2)) % 50) / 100);
        const lx = tx + Math.cos(a) * d, ly = ty - r * 0.15 + Math.sin(a) * d * 0.8;
        ctx.globalAlpha = on * (reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 2.2 + i * 1.7 + (seed % 10)));
        if (lr < 1.3) ctx.fillRect(lx - lr, ly - lr, 2 * lr, 2 * lr);
        else { ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
  }

  // A bus stop: a slim post with a round gold badge carrying the stop's number on its line. Stops
  // with a shelter picture (client/tiles/<stop id>.webp) show the shelter under the badge instead
  // of the post, and the shelter can be tapped too.
  drawStop(s, night) {
    const ctx = this.ctx, [bx, by] = this.P(s.at[0], s.at[1], 0), [tx, ty] = this.P(s.at[0], s.at[1], 8), rb = Math.max(8.5, Math.min(14, 4.8 * this.scale));
    const shelter = this.tile(s.id), a = shelter && shelter.info.kind === "sprite" ? shelter.info.anchors.ground : null;
    if (a) {
      const W = SHELTER_M * this.scale, H = W * shelter.img.naturalHeight / shelter.img.naturalWidth, x = bx - a[0] * W, y = by - a[1] * H;
      if (x < this.cw && x + W > 0 && y < this.ch && y + H > 0) ctx.drawImage(this.bakedSprite(shelter, W), x, y, W, H);
      this.hit.push({ kind: "stop", id: s.id, poly: [[x + W * 0.08, y + H * 0.25], [x + W * 0.92, y + H * 0.25], [x + W * 0.92, y + H], [x + W * 0.08, y + H]] });
    } else {
      ctx.strokeStyle = this.lit("#3b3a33", 0.5); ctx.lineWidth = Math.max(1, 0.5 * this.scale); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    }
    const cy = ty - rb * 0.6;
    if (night > 0.3) this.glow(tx, cy, rb * 2.6, 0.45 * night);
    const gg = ctx.createRadialGradient(tx - rb * 0.35, cy - rb * 0.4, 1, tx, cy, rb);
    gg.addColorStop(0, "#f6e3b8"); gg.addColorStop(1, "#c39552");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(tx, cy, rb, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1.2, rb * 0.16); ctx.strokeStyle = LOOK.emerald; ctx.stroke();
    ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(247,236,214,.85)"; ctx.beginPath(); ctx.arc(tx, cy, rb * 0.78, 0, Math.PI * 2); ctx.stroke();
    const n = this.stopNo && this.stopNo.get(s.id);
    if (n) { ctx.fillStyle = LOOK.emerald; ctx.font = `700 ${Math.round(rb * 1.12)}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), tx, cy + rb * 0.06); }
    if (this.selected && this.selected.kind === "stop" && this.selected.id === s.id) {
      ctx.lineWidth = 2.5; ctx.strokeStyle = LOOK.emerald; ctx.beginPath(); ctx.arc(tx, cy, rb + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = LOOK.goldLight; ctx.beginPath(); ctx.arc(tx, cy, rb + 4.5, 0, Math.PI * 2); ctx.stroke();
    }
    // Generous tap target (at least 44 px across) around the sign.
    this.hit.push({ kind: "stop", id: s.id, circle: [tx, cy, Math.max(22, rb * 1.5)] });
  }

  drawBuilding(b, fp, dl, night, now) {
    const P = this.P.bind(this), ctx = this.ctx, w = this.world;
    const sel = this.selected && this.selected.kind === "place" && (this.selected.id === b.id || (b.units || []).some(u => u.id === this.selected.id));
    const outline = pts => { ctx.lineWidth = 3.5; this.poly(pts, null, "rgba(11,43,35,.55)"); ctx.lineWidth = 2; this.poly(pts, null, LOOK.goldLight); };
    // The owner's picture of this building, once it has loaded; while it's going up, its site's.
    const building = b.status === "under_construction", proj = building ? w.projects.get(b.id) : null;
    const spr = building ? this.siteSprite(b, proj) : this.sprite(b.id);
    if (spr) {
      const r = this.spriteRect(spr, fp);
      this.hit.push({ kind: "place", id: b.id, poly: r.poly });
      // The crane stands at the back of the lot: drawn first, the site's fences and huts hide its foot.
      if (building) this.drawCraneMarker(fp, proj, spr.id, dl, now, false);
      if (r.x + r.W < -20 || r.x > this.cw + 20 || r.y > this.ch + 20 || r.bottom < -20) return;
      this.spriteTops.set(b.id, r.y);
      if (sel) { ctx.fillStyle = "rgba(218,187,133,.22)"; this.poly(r.lot, ctx.fillStyle); outline(r.lot); }
      if (night > 0.3 && this.scale > 0.5) this.glow((r.x + r.W / 2), r.bottom - r.H * 0.3, r.W * 0.75, 0.32 * night, 0.7);
      ctx.drawImage(this.bakedSprite(spr, r.W), r.x, r.y, r.W, r.H);
      if (night > 0.3 && b.status === "open" && this.scale > 0.5) { const [dx, dy] = P(b.door[0], b.door[1] + 2, 0); this.glow(dx, dy, 7 * this.scale, 0.45 * night, 0.55); }
      return;
    }
    // Off screen: nothing to draw, but the tap target stays where it always is.
    const [lx] = P(fp.x0, fp.y1, 0), [rx] = P(fp.x1, fp.y0, 0), [, ty] = P(fp.x0, fp.y0, fp.h + 40), [, by] = P(fp.x1, fp.y1, 0);
    if (rx < -60 || lx > this.cw + 60 || by < -20 || ty > this.ch + 20) {
      const flat = b.status === "under_construction" || fp.pal === "field" || fp.pal === "court";
      this.hit.push({ kind: "place", id: b.id, poly: flat ? [P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)]
        : [P(fp.x0, fp.y1, 0), P(fp.x1, fp.y1, 0), P(fp.x1, fp.y0, 0), P(fp.x1, fp.y0, fp.h), P(fp.x0, fp.y0, fp.h), P(fp.x0, fp.y1, fp.h)] });
      return;
    }
    if (building) {
      // A building still going up: site, rising frame and a crane.
      const pct = proj ? proj.progress_pct || 0 : 10;
      this.poly([P(fp.x0 - 3, fp.y0 - 3), P(fp.x1 + 3, fp.y0 - 3), P(fp.x1 + 3, fp.y1 + 3), P(fp.x0 - 3, fp.y1 + 3)], this.lit("#d8c19a"));
      if (!proj || proj.status === "active") this.drawFrame(fp, pct);
      this.drawCraneMarker(fp, proj, null, dl, now, true);
      const r4 = [P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)];
      this.hit.push({ kind: "place", id: b.id, poly: r4 });
      if (sel) outline(r4);
      return;
    }
    const cols = this.faces((SPECIAL_COLORS[b.id] || PAL[fp.pal] || PAL.shop).map(c => this.lit(c)));
    if (b.shape === "street_corner") {
      const pc = LOOK.stone.map(c => this.lit(c));
      this.poly([P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)], this.lit("#cdbb9a"));
      for (const px of [fp.x0 + 2, fp.x1 - 4]) this.drawBox({ x0: px, x1: px + 2, y0: fp.y0 + 2, y1: fp.y1 - 2, h: fp.h - 2 }, pc, {});
      this.drawBox({ ...fp, z0: fp.h - 2 }, [this.lit(LOOK.emeraldMid, 0.6), this.lit(LOOK.emerald, 0.5), this.lit(LOOK.emeraldDeep, 0.5)], { trim: true });
      this.hit.push({ kind: "place", id: b.id, poly: [P(fp.x0, fp.y1, 0), P(fp.x1, fp.y1, 0), P(fp.x1, fp.y0, 0), P(fp.x1, fp.y0, fp.h), P(fp.x0, fp.y0, fp.h), P(fp.x0, fp.y1, fp.h)] });
      return;
    }
    if (fp.pal === "field" || fp.pal === "court") {
      const surf = this.lit(fp.pal === "field" ? PAL.field[0] : PAL.court[0]), line = rgba(this.lit("#fffaf0", 0.7), 0.6 + 0.3 * dl);
      const r4 = [P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)];
      ctx.lineWidth = 1;
      this.poly(r4, surf, line);
      const mx = (fp.x0 + fp.x1) / 2; ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(...P(mx, fp.y0)); ctx.lineTo(...P(mx, fp.y1)); ctx.stroke();
      if (night > 0.3) for (const [lx, ly] of [[fp.x0, fp.y0], [fp.x1, fp.y0], [fp.x0, fp.y1], [fp.x1, fp.y1]]) {
        const [px, py] = P(lx, ly, 12); this.glow(px, py, 6 * this.scale, 0.7 * night); }
      this.hit.push({ kind: "place", id: b.id, poly: r4 });
      if (sel) outline(r4);
      return;
    }
    const open = b.status === "open", pulse = period => (this.reduce ? 0.5 : Math.sin(now / period));
    this.drawBox(fp, cols, { night, id: b.id, litChance: b.units ? 55 : open ? 70 : 8, trim: true, glass: GOLD_EDGED.has(fp.pal) && !SPECIAL_COLORS[b.id] });
    const t = b.shape;
    if (t === "house") {
      const z = fp.h, mx = (fp.x0 + fp.x1) / 2, rc = this.lit(LOOK.roof);
      this.poly([P(fp.x0, fp.y0, z), P(mx, fp.y0, z + 6), P(mx, fp.y1, z + 6), P(fp.x0, fp.y1, z)], rc);
      this.poly([P(mx, fp.y0, z + 6), P(fp.x1, fp.y0, z), P(fp.x1, fp.y1, z), P(mx, fp.y1, z + 6)], mix(rc, "#000000", 0.18));
      ctx.lineWidth = Math.max(0.6, 0.3 * this.scale); ctx.strokeStyle = this.wc.gold;
      ctx.beginPath(); ctx.moveTo(...P(mx, fp.y0, z + 6)); ctx.lineTo(...P(mx, fp.y1, z + 6)); ctx.stroke();
    }
    if (t === "cinema" && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h - 2), P(fp.x1, fp.y1, fp.h - 2)], null, `rgba(255,214,120,${0.6 + 0.3 * pulse(250)})`); }
    if (t === "school" || t === "daycare") {
      const [bx, by] = P(fp.x1 - 2, fp.y1 + 2, 0), [tx, ty] = P(fp.x1 - 2, fp.y1 + 2, fp.h + 10);
      ctx.strokeStyle = this.lit("#e8dcc4"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = this.lit(t === "daycare" ? LOOK.gold : LOOK.emeraldMid, 0.6); ctx.fillRect(tx, ty, 6, 4);
    }
    if (t === "hospital") {
      const cx = (fp.x0 + fp.x1) / 2, cy = (fp.y0 + fp.y1) / 2, z = fp.h + 0.1;
      for (const [a, bb] of [[7, 2.2], [2.2, 7]]) this.poly([P(cx - a, cy - bb, z), P(cx + a, cy - bb, z), P(cx + a, cy + bb, z), P(cx - a, cy + bb, z)], this.lit("#b8473f"));
    }
    const awning = { bar: "#2e4636", salon: "#7a4d5e", clothing_store: "#1d2422", pharmacy: "#2e4636", restaurant: "#6e2430", laundromat: "#3d6470", coffee_shop: "#0b2b23", boutique: "#1d2422" }[t];
    if (awning) {
      const z = 4.5, aw = [P(fp.x0, fp.y1, z + 2), P(fp.x1, fp.y1, z + 2), P(fp.x1, fp.y1 + 3, z), P(fp.x0, fp.y1 + 3, z)];
      this.poly(aw, this.lit(awning, 0.6));
      ctx.lineWidth = Math.max(0.6, 0.3 * this.scale); ctx.strokeStyle = this.wc.gold;
      ctx.beginPath(); ctx.moveTo(...aw[3]); ctx.lineTo(...aw[2]); ctx.stroke();
    }
    if (t === "bar" && open && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h), P(fp.x1, fp.y1, fp.h)], null, `rgba(255,170,90,${0.55 + 0.3 * pulse(500)})`); }
    if (t === "church") {
      // Brick nave, a white stone steeple and a gold spire, as on the poster's Church Street.
      const sx = fp.x0 + 4, sy = fp.y1 - 6, wc = PAL.civic.map(c => this.lit(c));
      this.drawBox({ x0: sx - 3, x1: sx + 3, y0: sy - 3, y1: sy + 3, h: fp.h + 14 }, wc, { night: 0, trim: true });
      this.poly([P(sx - 3, sy - 3, fp.h + 14), P(sx + 3, sy + 3, fp.h + 14), P(sx, sy, fp.h + 24)], this.lit(LOOK.gold, 0.5));
    }
    if (t === "nightclub" && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h), P(fp.x1, fp.y1, fp.h), P(fp.x1, fp.y0, fp.h)], null, `rgba(240,120,170,${0.5 + 0.4 * pulse(300)})`); }
    // A warm pool of light at the door of a place that's open after dark.
    if (night > 0.3 && (open || b.units) && this.scale > 0.5) { const [dx, dy] = P(b.door[0], b.door[1] + 1.5, 0); this.glow(dx, dy, 7 * this.scale, 0.5 * night, 0.55); }
    const top = [P(fp.x0, fp.y0, fp.h), P(fp.x1, fp.y0, fp.h), P(fp.x1, fp.y1, fp.h), P(fp.x0, fp.y1, fp.h)];
    this.hit.push({ kind: "place", id: b.id, poly: [P(fp.x0, fp.y1, 0), P(fp.x1, fp.y1, 0), P(fp.x1, fp.y0, 0), top[1], top[0], top[3]] });
    if (sel) outline(top);
  }

  // A person, whole and at real scale (figures.js): their cut-out from the owner's sheets, or the
  // stand-in body for someone without one. Facing their way, walking while they walk (no bob under
  // reduced motion), darkened at night like everything else. Someone inside a building stands at its
  // door, a little faded (interiors aren't drawn on the map). The tap target is the whole figure, at
  // least 44 px each way; the name plate above it can be tapped too.
  drawPerson(c, night) {
    const ctx = this.ctx, sx = c.sx0 + c.dx, sy = c.sy0 + c.dy, ph = this.personHeight(), L = this.light;
    c.box = null;
    if (sx < -ph - 40 || sx > this.cw + ph + 40 || sy < -40 || sy > this.ch + ph * 1.4 + 40) return;   // off screen
    const tint = night < 0.5 && L.amt > 0.02 ? [quantize(L.amb), Math.min(0.25, L.amt * 0.6)] : null;
    let box;
    if (c.bus) box = this.drawShuttle(c, sx, sy, ph, night, tint);
    else {
      if (c.inside) ctx.globalAlpha = 0.78;
      const g = c.gait, walk = c.walking && !this.reduce;
      const r = drawFigure(ctx, c.person, sx, sy, { height: ph, facing: g.facing, mirror: g.mirror, pose: walk ? "walk" : "stand", phase: g.phase,
        night, tint });
      ctx.globalAlpha = 1;
      box = [r.x0, r.y0, r.x1, r.y1];
    }
    c.box = box;
    c.screen = [sx, box[1], 0];
    if (c.self) return;
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, hw = Math.max(22, (box[2] - box[0]) / 2 + 4), hh = Math.max(22, (box[3] - box[1]) / 2 + 4);
    this.hit.push({ kind: "person", id: c.id, circle: [cx, cy, Math.min(hw, hh)], rect: [cx - hw, cy - hh, cx + hw, cy + hh] });
  }
  // The name plate can be tapped too (the figure's own target is the 44 px one; the plate's is just
  // the plate, so it doesn't cover the building behind more than it shows).
  plateHits(people) {
    for (const c of people) if (c.nameAt && !c.self && c.box) {
      const [nx, ny, lw] = c.nameAt, cx = (c.box[0] + c.box[2]) / 2, cy = (c.box[1] + c.box[3]) / 2;
      this.hit.push({ kind: "person", id: c.id, circle: [cx, cy, 1], rect: [nx, ny, nx + lw, ny + 17] });
    }
  }
  // The poster's bus at real scale (emerald body, gold stripe, ivory roof, warm windows), the
  // rider seated behind its windows.
  drawShuttle(c, sx, sy, ph, night, tint) {
    const ctx = this.ctx, bh = ph * 2.6 / PERSON_M, bw = bh * 2.3, x0 = sx - bw / 2, y0 = sy - bh * 1.08, wheel = Math.max(1.5, bh * 0.13);
    ctx.fillStyle = "rgba(40,28,14,.28)"; ctx.beginPath(); ctx.ellipse(sx, sy, bw * 0.55, Math.max(2, bh * 0.16), 0, 0, Math.PI * 2); ctx.fill();
    const rad = Math.min(4, bh * 0.18);
    ctx.fillStyle = LOOK.emerald; ctx.beginPath(); ctx.roundRect(x0, y0, bw, bh, rad); ctx.fill();
    ctx.fillStyle = LOOK.ivory; ctx.beginPath(); ctx.roundRect(x0 + bw * 0.03, y0 - bh * 0.06, bw * 0.94, bh * 0.12, rad / 2); ctx.fill();
    const wy = y0 + bh * 0.12, wh = bh * 0.38, n = 4, ww = (bw * 0.9) / n;
    ctx.fillStyle = night > 0.3 ? "rgba(255,214,140,.95)" : "rgba(246,230,196,.92)";
    for (let i = 0; i < n; i++) ctx.fillRect(x0 + bw * 0.05 + i * ww, wy, ww - Math.max(1, bw * 0.02), wh);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.rect(x0 + bw * 0.05 + i * ww, wy, ww - Math.max(1, bw * 0.02), wh);
    ctx.clip();
    // Head and shoulders in the windows (the body below them hides the rest).
    drawFigure(ctx, c.person, sx + bw * 0.08, wy + wh * 0.12 + ph, { height: ph, facing: "front34", mirror: false, night, tint });
    ctx.restore();
    ctx.fillStyle = LOOK.gold; ctx.fillRect(x0, y0 + bh * 0.6, bw, Math.max(1.5, bh * 0.1));
    ctx.strokeStyle = LOOK.gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x0, y0, bw, bh, rad); ctx.stroke();
    for (const wx of [sx - bw / 3, sx + bw / 3]) {
      ctx.fillStyle = "#1c1f1d"; ctx.beginPath(); ctx.arc(wx, sy - wheel, wheel, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = LOOK.gold; ctx.beginPath(); ctx.arc(wx, sy - wheel, wheel * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    return [x0, y0 - bh * 0.06, x0 + bw, sy];
  }

  // How far your voice carries: a ring on the ground (outdoors; indoors the whole building hears).
  drawRing(now) {
    const w = this.world, self = w.self;
    if (!self || self.inside) return;
    const vol = this.ringHold || (this.ring && this.ring.until > now ? this.ring.volume : null);
    if (!vol) return;
    const r = w.rangeFor(vol), c = predict(self, now), ctx = this.ctx;
    if (!c) return;
    const pts = [];
    for (let a = 0; a < Math.PI * 2; a += 0.08) pts.push(this.P(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r));
    ctx.lineWidth = 2; ctx.setLineDash(vol === "whisper" ? [3, 3] : []);
    const gold = this.night > 0.5 ? "rgba(232,207,156,.9)" : "rgba(160,118,52,.9)";
    this.poly(pts, vol === "shout" ? "rgba(214,140,130,.12)" : "rgba(218,187,133,.14)", vol === "shout" ? "rgba(196,98,90,.9)" : gold);
    ctx.setLineDash([]);
  }

  drawWeather(wx, now, dl) {
    if (!wx) return;
    const ctx = this.ctx, cw = this.cw, ch = this.ch;
    const reduce = this.reduce, tt = reduce ? 0 : now / 1000;
    if (wx.kind === "rain" || wx.kind === "storm") {
      ctx.fillStyle = `rgba(30,48,50,${wx.kind === "storm" ? 0.22 : 0.12})`; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = `rgba(214,222,226,${0.25 + 0.2 * dl})`; ctx.lineWidth = 1;
      const n = wx.kind === "storm" ? 220 : 130; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = ((i * 97.3) % cw + tt * 60) % cw, y = ((i * 53.7) % ch + tt * (520 + (i % 5) * 40)) % ch; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 11); }
      ctx.stroke();
      if (wx.kind === "storm" && !reduce && Math.sin(now / 1700) > 0.985) { ctx.fillStyle = "rgba(240,240,250,.35)"; ctx.fillRect(0, 0, cw, ch); }
    } else if (wx.kind === "snow") {
      ctx.fillStyle = "rgba(240,238,232,.22)"; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "rgba(250,248,244,.9)";
      for (let i = 0; i < 160; i++) { const x = ((i * 71.9) % cw + Math.sin(tt + i) * 8 + tt * 10) % cw, y = ((i * 41.3) % ch + tt * (40 + (i % 4) * 10)) % ch; ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill(); }
    } else if (wx.kind === "cloud") { ctx.fillStyle = "rgba(70,72,66,.10)"; ctx.fillRect(0, 0, cw, ch); }
  }

  // (x, y): just above the speaker's head and name plate. A bubble goes above it, but not under the
  // top bar: with no room there it goes below the speaker's feet (`under`), if that fits on the
  // visible map, else it stays just under the top bar.
  bubble(x, y, text, style, under = null, top = 6, bottom = this.ch - 6) {
    const ctx = this.ctx, cw = this.cw;
    ctx.font = `${style === "whisper" || style === "whispering" ? "italic " : ""}${style === "shout" ? 700 : 500} ${style === "shout" ? 14 : 12}px ${SANS}`;
    const maxW = Math.min(220, cw * 0.6), words = String(text).split(" "), lines = [];
    let line = "";
    for (const wd of words) { const test = line ? line + " " + wd : wd; if (ctx.measureText(test).width > maxW - 16 && line) { lines.push(line); line = wd; } else line = test; }
    lines.push(line);
    const shown = lines.slice(0, 4); if (lines.length > 4) shown[3] += " …";
    const w = Math.min(maxW, Math.max(...shown.map(l => ctx.measureText(l).width)) + 18), hh = shown.length * 15 + 12;
    const bx = Math.max(6, Math.min(cw - w - 6, x - w / 2));
    let by = y - hh - 8, below = false;
    if (by < top) {
      if (under !== null && under + 8 + hh <= bottom) { by = under + 8; below = true; } else by = top;
    }
    const dark = style === "whisper" || style === "whispering";
    ctx.fillStyle = dark ? "rgba(11,43,35,.93)" : "rgba(251,245,233,.97)";
    ctx.beginPath(); ctx.roundRect(bx, by, w, hh, 10); ctx.fill();
    if (dark) { ctx.setLineDash([4, 3]); ctx.strokeStyle = LOOK.ivory; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
    else if (style === "shout") { ctx.strokeStyle = "#c4625a"; ctx.lineWidth = 1.5; ctx.stroke(); }
    else { ctx.strokeStyle = "rgba(180,138,76,.55)"; ctx.lineWidth = 1; ctx.stroke(); }
    const tx = Math.max(bx + 10, Math.min(bx + w - 10, x));
    ctx.beginPath();
    if (below) { ctx.moveTo(tx - 5, by); ctx.lineTo(tx + 5, by); ctx.lineTo(tx, by - 7); }
    else { ctx.moveTo(tx - 5, by + hh); ctx.lineTo(tx + 5, by + hh); ctx.lineTo(tx, by + hh + 7); }
    ctx.closePath(); ctx.fill();
    this.bubbleRects.push({ x: bx, y: by, w, h: hh, below });
    ctx.fillStyle = dark ? LOOK.ivory : "#13261f"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    shown.forEach((l, i) => ctx.fillText(l, bx + 9, by + 6 + i * 15));
  }
  drawBubbles(people, now) {
    const pos = new Map(people.filter(p => p.box).map(p => [p.id, [...this.overHead(p), p.box[3]]]));
    // Keep bubbles in the part of the map the top bar (and, on phones, the sheet) leaves visible.
    const ins = this.getInsets ? this.getInsets() : { top: 0, bottom: 0 };
    const top = Math.min(ins.top || 0, this.ch * 0.5) + 6, bottom = this.ch - Math.min(ins.bottom || 0, this.ch - top - 40) - 6;
    this.bubbleRects = [];
    for (const b of this.world.liveBubbles(now)) {
      let x, y, under = null;
      const sp = pos.get(b.who);
      if (sp) [x, y, under] = sp;
      else if (b.pos) [x, y] = this.P(b.pos[0], b.pos[1], PERSON_M * ART_M + 1);
      else continue;  // the speech log under the map shows it
      const text = b.kind === "whispering" ? `whispering to ${b.toName}` : b.text;
      this.bubble(x, y, text, b.kind === "whispering" ? "whispering" : b.volume, under, top, bottom);
    }
  }
}
