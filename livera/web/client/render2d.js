// The 2.5D isometric renderer, forked from the town preview (days20_shell.html): the same
// projection P(), boxes, cranes, labels, weather, bubbles and tap detection, drawing the live
// world model instead of a recording. It reads `World` and never changes it; taps are handed
// to the UI as intents. A three.js renderer can replace this file behind the same interface:
// new Renderer(canvas, world), .frame(now), .onTap, .select(), .centerOn(), .setRing().

import { PAL, SPECIAL_COLORS, footprint, ROADS, PARK_SHAPES, RIVER, TREES } from "./layout.js";
import { predict, dist } from "./state.js";
import { faceUrl, initials, firstName } from "./dom.js";

const C = Math.cos(Math.PI / 6), S = 0.5;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
function seeded(id, n) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1103515245 + 12345) >>> 0) % n); }
function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

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
    this.images = new Map();
    this.onTap = null;
    this.lastNow = performance.now();
    this.placed = [];
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
  minScale() {
    const b = this.world.bounds, w = (b.max[0] - b.min[0] + b.max[1] - b.min[1]) * C;
    return Math.max(0.2, Math.min(this.cw / w, this.ch / ((b.max[0] + b.max[1]) * S)) * 0.9);
  }
  // Where the camera centres a world point: a little above the middle, so the bottom sheet and
  // chat bar don't cover you.
  centerTarget(x, y) {
    const [cx, cy] = this.viewCenter();
    return [cx - (x - y) * C * this.scale, cy - (x + y) * S * this.scale];
  }
  // Just above the middle of the map area the panels leave uncovered (the feed sits low).
  viewCenter() {
    const ins = this.getInsets ? this.getInsets() : { top: 0, bottom: 0 };
    const top = Math.min(ins.top, this.ch * 0.5), bottom = Math.min(ins.bottom, this.ch - top - 80);
    return [this.cw / 2, top + (this.ch - top - bottom) * 0.45];
  }
  centerOn(x, y, follow = false) {
    [this.ox, this.oy] = this.centerTarget(x, y);
    this.follow = follow;
  }
  zoomAt(f, sx, sy) {
    const nz = Math.max(this.minScale(), Math.min(8, this.scale * f));
    f = nz / this.scale;
    this.ox = sx - (sx - this.ox) * f; this.oy = sy - (sy - this.oy) * f; this.scale = nz;
  }
  zoomBy(f) { this.zoomAt(f, ...this.viewCenter()); }
  fitTown() {
    this.scale = this.minScale();
    const b = this.world.bounds;
    this.centerOn((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, false);
  }
  followMe() { this.follow = true; if (this.scale < 1.2) this.scale = this.cw < 700 ? 1.6 : 1.9; }
  select(s) { this.selected = s; }
  setRing(volume) { this.ring = volume ? { volume, until: performance.now() + 2500 } : null; }

  face(id) {
    const url = faceUrl(id);
    if (!url) return null;
    let im = this.images.get(id);
    if (!im) { im = new Image(); im.decoding = "async"; im.src = url; this.images.set(id, im); }
    return im.complete && im.naturalWidth ? im : null;
  }

  // ------------------------------------------------------------------ input: drag, pinch, wheel, tap
  attachInput() {
    const cv = this.canvas, pointers = new Map();
    let drag = null;
    const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    const mid = () => { const r = cv.getBoundingClientRect(), [a, b] = [...pointers.values()]; return [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top]; };
    cv.addEventListener("pointerdown", e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { x: e.clientX, y: e.clientY, moved: drag && pointers.size > 1 ? 99 : 0, dist: pointers.size === 2 ? pinchDist() : 0 };
    });
    cv.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId) || !drag) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) { const d = pinchDist(); if (drag.dist) this.zoomAt(d / drag.dist, ...mid()); drag.dist = d; drag.moved = 99; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) { cv.classList.add("dragging"); this.follow = false; this.ox += dx; this.oy += dy; }
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const up = e => {
      const wasTap = drag && drag.moved <= 6 && pointers.size === 1 && e.type === "pointerup";
      pointers.delete(e.pointerId); cv.classList.remove("dragging");
      if (wasTap) { const r = cv.getBoundingClientRect(); this.tap(e.clientX - r.left, e.clientY - r.top); }
      if (pointers.size === 0) drag = null;
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
  hitTest(x, y) {
    for (let i = this.hit.length - 1; i >= 0; i--) {
      const h = this.hit[i];
      if (h.circle ? Math.hypot(x - h.circle[0], y - h.circle[1]) <= h.circle[2] : inPoly(x, y, h.poly)) return { kind: h.kind, id: h.id };
    }
    return null;
  }
  tap(x, y) {
    const h = this.hitTest(x, y);
    const w = this.unproject(x, y);
    if (this.onTap) this.onTap(h ? { ...h, world: w } : { kind: "ground", world: w });
  }
  // For tests and the UI: where a world point is on screen right now.
  project(x, y, z = 0) { return this.P(x, y, z); }

  // ------------------------------------------------------------------ helpers
  poly(pts, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  drawBox(b, colors, opts = {}) {
    const { x0, x1, y0, y1, h } = b, z0 = b.z0 || 0, P = this.P.bind(this), night = opts.night || 0;
    this.poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, h), P(x1, y0, h)], colors[1]);
    this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, h), P(x0, y1, h)], colors[2]);
    this.poly([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], colors[0]);
    if (h >= 8 && !z0 && this.scale > 0.35) {
      const rnd = seeded(opts.id || "x", 100), rows = Math.max(1, Math.floor((h - 3) / 4)), lit = opts.litChance ?? 45;
      const winW = 2.2, gap = 4;
      const faces = [[(x1 - x0), (k, z) => [x0 + k, y1, z]], [(y1 - y0), (k, z) => [x1, y0 + k, z]]];
      for (const [len, at] of faces) for (let r = 0; r < rows; r++) for (let k = 2; k + winW <= len - 1; k += gap) {
        const z = 3 + r * 4, on = night > 0.2 && rnd() < lit;
        this.poly([P(...at(k, z)), P(...at(k + winW, z)), P(...at(k + winW, z + 2.2)), P(...at(k, z + 2.2))],
          on ? `rgba(255,208,130,${0.55 + 0.4 * night})` : `rgba(40,52,66,${0.55 - 0.25 * night})`);
      }
    }
  }
  drawCrane(x, y, h, working, now) {
    const ctx = this.ctx, P = this.P.bind(this);
    ctx.lineWidth = Math.max(1, 1.2 * this.scale); ctx.strokeStyle = "#e0a23a";
    const base = P(x, y, 0), top = P(x, y, h), arm = P(x + 22, y - 6, h), back = P(x - 8, y + 3, h);
    ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...top); ctx.moveTo(...back); ctx.lineTo(...arm); ctx.stroke();
    const hook = P(x + 16, y - 4, h - 10 - (working ? 4 * Math.sin(now / 600) : 0));
    ctx.strokeStyle = "rgba(220,220,220,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...P(x + 16, y - 4, h)); ctx.lineTo(...hook); ctx.stroke();
  }
  drawFrame(b, pct) {
    const ctx = this.ctx, P = this.P.bind(this), h = Math.max(1.5, b.h * pct / 100);
    ctx.strokeStyle = "rgba(200,170,120,.85)"; ctx.lineWidth = Math.max(1, 0.8 * this.scale);
    for (let x = b.x0; x <= b.x1 + 0.1; x += (b.x1 - b.x0) / 4) for (const y of [b.y0, b.y1]) { ctx.beginPath(); ctx.moveTo(...P(x, y, 0)); ctx.lineTo(...P(x, y, h)); ctx.stroke(); }
    for (let z = 0; z <= h; z += 4) this.poly([P(b.x0, b.y0, z), P(b.x1, b.y0, z), P(b.x1, b.y1, z), P(b.x0, b.y1, z)], null, "rgba(200,170,120,.5)");
  }
  claim(x, y, w, h, steps = [0, -1, 1, -2, 2, -3]) {
    const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    for (const k of steps) { const yy = y + k * (h + 2); if (!this.placed.some(q => overlaps([x, yy, w, h], q))) { this.placed.push([x, yy, w, h]); return yy; } }
    return null;
  }
  label(text, x, y, z, strong) {
    const ctx = this.ctx;
    let [sx, sy] = this.P(x, y, z);
    ctx.font = `${strong ? 600 : 500} ${strong ? 12 : 11}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const w = ctx.measureText(text).width + 12;
    if (sx < -w || sx > this.cw + w || sy < -20 || sy > this.ch + 20) return;
    sx = Math.max(w / 2 + 4, Math.min(this.cw - w / 2 - 4, sx));
    const at = this.claim(sx - w / 2, sy - 18, w, 17);
    if (at === null && !strong) return;
    if (at !== null) sy = at + 18;
    ctx.fillStyle = strong ? "rgba(207,174,116,.95)" : "rgba(14,12,11,.74)";
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 18, w, 17, 8); ctx.fill();
    ctx.fillStyle = strong ? "#0e0c0b" : "#efe7dc"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, sx, sy - 9.5);
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
      if (!this.centered) { this.ox = tx; this.oy = ty; this.centered = true; this.scale = this.cw < 700 ? 1.6 : 1.9; [this.ox, this.oy] = this.centerTarget(me[0], me[1]); }
      else { const k = 1 - Math.exp(-dt * 6); this.ox += (tx - this.ox) * k; this.oy += (ty - this.oy) * k; }
    }
    this.draw(now, dt);
  }

  draw(now, dt) {
    const ctx = this.ctx, w = this.world, P = this.P.bind(this), cw = this.cw, ch = this.ch;
    const m = w.minute(now) ?? 720, dl = daylight(m), night = 1 - dl;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.hit = [];
    // Sky
    const h = (m % 1440) / 60;
    const skyTop = night > 0.95 ? "#070b1a" : h < 12 ? mix("#1b2240", "#9fc3dc", dl) : mix("#2a1d33", "#a9c7dc", dl);
    const skyLow = h >= 17 && h < 20.5 ? mix("#e59a64", "#c9dceb", Math.max(0, dl - 0.3)) : h >= 4.5 && h < 7.5 ? mix("#d98e6a", "#c9dceb", dl) : mix("#0b1022", "#d7e6ef", dl);
    const wx = w.weather, grey = wx ? { cloud: 0.35, rain: 0.55, storm: 0.75, snow: 0.45 }[wx.kind] || 0 : 0;
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, grey ? mix(skyTop, mix("#1a1d22", "#8d939a", dl), grey) : skyTop);
    g.addColorStop(1, grey ? mix(skyLow, mix("#1d2026", "#a3a8ae", dl), grey) : skyLow);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // Ground with a 50 m grid
    const B = w.bounds;
    this.poly([P(B.min[0], B.min[1]), P(B.max[0], B.min[1]), P(B.max[0], B.max[1]), P(B.min[0], B.max[1])], mix("#1d2219", "#8f9a6b", dl));
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(0,0,0,${0.06 + 0.05 * night})`;
    for (let x = B.min[0]; x <= B.max[0]; x += 50) { ctx.beginPath(); ctx.moveTo(...P(x, B.min[1])); ctx.lineTo(...P(x, B.max[1])); ctx.stroke(); }
    for (let y = B.min[1]; y <= B.max[1]; y += 50) { ctx.beginPath(); ctx.moveTo(...P(B.min[0], y)); ctx.lineTo(...P(B.max[0], y)); ctx.stroke(); }
    // River (sketch)
    this.poly([P(RIVER.x0, B.min[1]), P(RIVER.x1, B.min[1]), P(RIVER.x1, B.max[1]), P(RIVER.x0, B.max[1])], mix("#0e1a2e", "#5b8fb0", dl));
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.1 * dl})`;
    for (let i = 0; i < 9; i++) { const yy = 60 + i * 85 + (now / 120 % 40); ctx.beginPath(); ctx.moveTo(...P(900, yy)); ctx.lineTo(...P(935, yy + 8)); ctx.stroke(); }
    // Parks: real places, sketched outlines
    for (const pl of w.places) {
      if (pl.type !== "park") continue;
      const shape = PARK_SHAPES[pl.id] || { rx: 30, ry: 28 }, [cx, cy] = pl.door, lawn = [];
      for (let a = 0; a < Math.PI * 2; a += 0.2) lawn.push(P(cx + Math.cos(a) * shape.rx, cy + Math.sin(a) * shape.ry));
      this.poly(lawn, mix("#1f3324", "#4c7a52", dl));
      if (shape.lake) {
        const lake = []; for (let a = 0; a < Math.PI * 2; a += 0.2) lake.push(P(cx + Math.cos(a) * shape.lake.rx, cy + Math.sin(a) * shape.lake.ry));
        this.poly(lake, mix("#0e1a2e", "#5b8fb0", dl));
      }
      if (shape.boardwalk) {
        ctx.strokeStyle = mix("#3a2c1d", "#a07a4e", dl); ctx.lineWidth = Math.max(1, 1.6 * this.scale);
        ctx.beginPath(); ctx.moveTo(...P(cx + shape.boardwalk[0][0], cy + shape.boardwalk[0][1])); ctx.lineTo(...P(cx + shape.boardwalk[1][0], cy + shape.boardwalk[1][1])); ctx.stroke();
      }
      this.hit.push({ kind: "park", id: pl.id, poly: lawn });
    }
    // Roads (sketch). A road still being paved is gravel until the city says it's complete.
    for (const r of ROADS) {
      const proj = r.project && w.projects.get(r.project), paving = proj && proj.status !== "complete";
      ctx.strokeStyle = paving ? mix("#3a2c1d", "#a07a4e", dl) : mix("#2b2b2e", "#595a5e", dl);
      ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, 11 * this.scale * 0.9);
      ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(...P(...p)) : ctx.moveTo(...P(...p))); ctx.stroke();
      if (!paving) {
        ctx.strokeStyle = `rgba(240,220,170,${0.35 + 0.2 * dl})`; ctx.lineWidth = Math.max(0.6, 0.6 * this.scale); ctx.setLineDash([6 * this.scale, 6 * this.scale]);
        ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(...P(...p)) : ctx.moveTo(...P(...p))); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // Your walk target
    const self = w.self;
    if (self && self.target && !self.inside) {
      const sp = predict(self, now), [tx, ty] = P(...self.target);
      if (sp) {
        ctx.strokeStyle = "rgba(243,217,164,.75)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(...P(...sp)); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#f3d9a4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(tx, ty, 7, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Drawables back to front
    const items = [];
    for (const b of w.buildings) { const fp = footprint(b); items.push({ depth: fp.x1 + fp.y1, kind: "building", b, fp }); }
    for (const s of w.allStops()) items.push({ depth: s.at[0] + s.at[1], kind: "stop", s });
    for (const [x, y, s] of TREES) items.push({ depth: x + y, kind: "tree", x, y, s });
    const people = this.peopleToDraw(now, dt);
    for (const c of people) items.push({ depth: c.x + c.y + 30, kind: "person", c });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) {
      if (it.kind === "tree") this.drawTree(it, dl);
      else if (it.kind === "stop") this.drawStop(it.s, night);
      else if (it.kind === "building") this.drawBuilding(it.b, it.fp, dl, night, now);
      else if (it.kind === "person") this.drawPerson(it.c, night);
    }
    if (night > 0) { ctx.fillStyle = `rgba(8,12,34,${0.38 * night})`; ctx.fillRect(0, 0, cw, ch); }
    this.drawWeather(wx, now, dl);
    this.drawRing(now);
    // Labels: people first, then places, so place names move out of the way.
    this.placed = [];
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    for (const c of people) if (c.screen) {
      const [x, y, r] = c.screen; this.placed.push([x - r, y - r, r * 2, r * 2]);
      const lw = ctx.measureText(c.label).width + 10;
      c.nameAt = [x - lw / 2, this.claim(x - lw / 2, y + r + 3, lw, 15, [0, 1, 2, 3, 4, 5]) ?? y + r + 3, lw];
    }
    for (const c of people) if (c.bus && c.screen) this.label("single-rider shuttle", c.x, c.y, 14, false);
    const showAll = this.scale > 2.6, mePos = self ? this.standingPoint(self, now) : null;
    for (const b of w.buildings) {
      const sel = this.selected && this.selected.kind === "place" && (this.selected.id === b.id || (b.units || []).some(u => u.id === this.selected.id));
      const near = mePos && dist(mePos, b.door) < 45;
      if (!(sel || showAll || near || (self && self.inside && w.buildingOfPlace.get(self.inside) === b))) continue;
      const fp = footprint(b);
      const placeholder = b.type === "civic" && b.enterable === false;
      this.label(b.name + (placeholder ? " · placeholder landmark" : ""), (fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2, fp.h + (b.type === "church" ? 24 : 4), sel);
    }
    for (const pl of w.places) if (pl.type === "park" && (showAll || (mePos && dist(mePos, pl.door) < 60) || (this.selected && this.selected.id === pl.id))) this.label(pl.name, pl.door[0], pl.door[1], 6, this.selected && this.selected.id === pl.id);
    for (const s of w.allStops()) {
      const sel = this.selected && this.selected.kind === "stop" && this.selected.id === s.id;
      if (sel || this.scale > 3.2 || (mePos && dist(mePos, s.at) < 25)) this.label("Bus · " + s.name, s.at[0], s.at[1], 9, sel);
    }
    for (const c of people) if (c.nameAt) {
      ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const [nx, ny, lw] = c.nameAt;
      ctx.fillStyle = c.self ? "rgba(207,174,116,.95)" : c.scripted ? "rgba(40,44,52,.85)" : "rgba(14,12,11,.8)";
      ctx.beginPath(); ctx.roundRect(nx, ny, lw, 15, 7); ctx.fill();
      if (c.scripted) { ctx.setLineDash([2, 2]); ctx.strokeStyle = "rgba(239,231,220,.7)"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = c.self ? "#0e0c0b" : "#efe7dc"; ctx.fillText(c.label, nx + lw / 2, ny + 2);
    }
    this.drawBubbles(people, now);
  }

  peopleToDraw(now, dt) {
    const w = this.world, out = [];
    const add = (e, isSelf) => {
      const truth = this.standingPoint(e, now);
      if (!truth) return;
      let s = this.shown.get(e.id);
      if (!s || dist(s, truth) > 40) s = truth.slice();
      else { const k = 1 - Math.exp(-dt * 12); s = [s[0] + (truth[0] - s[0]) * k, s[1] + (truth[1] - s[1]) * k]; }
      this.shown.set(e.id, s);
      const name = isSelf ? "You" : firstName(e.name) + (e.scripted ? " · script" : "");
      out.push({ id: e.id, x: s[0], y: s[1], inside: e.inside, self: isSelf, scripted: !!e.scripted, name: e.name, label: name,
                 bus: e.mode === "bus" && !!e.target });
    };
    if (w.self) add(w.self, true);
    for (const p of w.people.values()) add(p, false);
    for (const id of [...this.shown.keys()]) if (id !== w.selfId && !w.people.has(id)) this.shown.delete(id);
    // Screen-space fan-out: people closer than a portrait's width stand in a row.
    const pr = Math.max(8, Math.min(16, 5 * this.scale + 4)), gap = pr * 2 + 4, clusters = [];
    for (const c of out) {
      [c.sx0, c.sy0] = this.P(c.x, c.y, 0);
      const cl = clusters.find(k => Math.hypot(k[0].sx0 - c.sx0, k[0].sy0 - c.sy0) < gap);
      cl ? cl.push(c) : clusters.push([c]);
    }
    for (const cl of clusters) cl.forEach((c, i) => { c.dx = (i - (cl.length - 1) / 2) * gap; c.dy = cl[0].sy0 - c.sy0; });
    this.pr = pr;
    return out;
  }

  drawTree(it, dl) {
    const ctx = this.ctx, [bx, by] = this.P(it.x, it.y, 0), [tx, ty] = this.P(it.x, it.y, it.s * 2.2);
    ctx.strokeStyle = "#4a3523"; ctx.lineWidth = Math.max(1, this.scale); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = mix("#1c2e1e", "#3f6b43", dl); ctx.beginPath(); ctx.arc(tx, ty, Math.max(2, it.s * this.scale * 0.9), 0, Math.PI * 2); ctx.fill();
  }

  drawStop(s, night) {
    const ctx = this.ctx, [bx, by] = this.P(s.at[0], s.at[1], 0), [tx, ty] = this.P(s.at[0], s.at[1], 7), w = Math.max(6, 3.2 * this.scale);
    ctx.strokeStyle = "#c9ced4"; ctx.lineWidth = Math.max(1, 0.5 * this.scale); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = "#3f8fa8"; ctx.beginPath(); ctx.roundRect(tx - w / 2, ty - w, w, w, 2); ctx.fill();
    if (night > 0.3) { ctx.fillStyle = `rgba(150,220,240,${0.25 * night})`; ctx.beginPath(); ctx.arc(tx, ty - w / 2, w * 1.4, 0, Math.PI * 2); ctx.fill(); }
    if (this.selected && this.selected.kind === "stop" && this.selected.id === s.id) { ctx.strokeStyle = "#f3d9a4"; ctx.lineWidth = 2; ctx.strokeRect(tx - w / 2 - 2, ty - w - 2, w + 4, w + 4); }
    // Generous tap target (at least 44 px across) around the sign.
    this.hit.push({ kind: "stop", id: s.id, circle: [tx, ty - w / 2, Math.max(22, w * 1.5)] });
  }

  drawBuilding(b, fp, dl, night, now) {
    const P = this.P.bind(this), ctx = this.ctx, w = this.world;
    const sel = this.selected && this.selected.kind === "place" && (this.selected.id === b.id || (b.units || []).some(u => u.id === this.selected.id));
    if (b.status === "under_construction") {
      // A building still going up: site, rising frame and a crane.
      const proj = w.projects.get(b.id), pct = proj ? proj.progress_pct || 0 : 10;
      this.poly([P(fp.x0 - 3, fp.y0 - 3), P(fp.x1 + 3, fp.y0 - 3), P(fp.x1 + 3, fp.y1 + 3), P(fp.x0 - 3, fp.y1 + 3)], mix("#2e2418", "#a5835a", dl));
      if (!proj || proj.status === "active") this.drawFrame(fp, pct);
      this.drawCrane(fp.x0 + 4, fp.y0 + 6, Math.max(fp.h, 20) + 12, !!(proj && proj.status === "active" && dl > 0.5), now);
      const r4 = [P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)];
      this.hit.push({ kind: "place", id: b.id, poly: r4 });
      if (sel) { ctx.lineWidth = 2; this.poly(r4, null, "#f3d9a4"); }
      return;
    }
    let cols = (SPECIAL_COLORS[b.id] || PAL[fp.pal] || PAL.shop).map(c => mix(mix(c, "#141824", 0.65), c, dl));
    if (b.shape === "street_corner") {
      const pc = ["#7d7f84", "#5f6166", "#4a4c50"].map(c => mix(mix(c, "#141824", 0.6), c, dl));
      this.poly([P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)], mix("#15161a", "#3e3f43", dl));
      for (const px of [fp.x0 + 2, fp.x1 - 4]) this.drawBox({ x0: px, x1: px + 2, y0: fp.y0 + 2, y1: fp.y1 - 2, h: fp.h - 2 }, pc, {});
      this.drawBox({ ...fp, z0: fp.h - 2 }, pc, {});
      this.hit.push({ kind: "place", id: b.id, poly: [P(fp.x0, fp.y1, 0), P(fp.x1, fp.y1, 0), P(fp.x1, fp.y0, 0), P(fp.x1, fp.y0, fp.h), P(fp.x0, fp.y0, fp.h), P(fp.x0, fp.y1, fp.h)] });
      return;
    }
    if (fp.pal === "field" || fp.pal === "court") {
      const surf = fp.pal === "field" ? mix("#1d3a22", "#4f8f4a", dl) : mix("#3a2418", "#c27a4a", dl);
      const r4 = [P(fp.x0, fp.y0), P(fp.x1, fp.y0), P(fp.x1, fp.y1), P(fp.x0, fp.y1)];
      this.poly(r4, surf, `rgba(240,240,230,${0.5 + 0.3 * dl})`);
      const mx = (fp.x0 + fp.x1) / 2; ctx.strokeStyle = `rgba(240,240,230,${0.5 + 0.3 * dl})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...P(mx, fp.y0)); ctx.lineTo(...P(mx, fp.y1)); ctx.stroke();
      if (night > 0.3) for (const [lx, ly] of [[fp.x0, fp.y0], [fp.x1, fp.y0], [fp.x0, fp.y1], [fp.x1, fp.y1]]) {
        const [px, py] = P(lx, ly, 12); ctx.fillStyle = `rgba(255,250,220,${0.5 * night})`; ctx.beginPath(); ctx.arc(px, py, 3 * this.scale, 0, Math.PI * 2); ctx.fill(); }
      this.hit.push({ kind: "place", id: b.id, poly: r4 });
      if (sel) { ctx.lineWidth = 2; this.poly(r4, null, "#f3d9a4"); }
      return;
    }
    const open = b.status === "open";
    this.drawBox(fp, cols, { night, id: b.id, litChance: b.units ? 55 : open ? 70 : 8 });
    const t = b.shape;
    if (t === "house") {
      const z = fp.h, mx = (fp.x0 + fp.x1) / 2, rc = mix(mix("#6b3a2a", "#141824", 0.6), "#6b3a2a", dl);
      this.poly([P(fp.x0, fp.y0, z), P(mx, fp.y0, z + 6), P(mx, fp.y1, z + 6), P(fp.x0, fp.y1, z)], rc);
      this.poly([P(mx, fp.y0, z + 6), P(fp.x1, fp.y0, z), P(fp.x1, fp.y1, z), P(mx, fp.y1, z + 6)], mix(rc, "#000000", 0.2));
    }
    if (t === "cinema" && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h - 2), P(fp.x1, fp.y1, fp.h - 2)], null, `rgba(255,214,120,${0.6 + 0.3 * Math.sin(now / 250)})`); }
    if (t === "school" || t === "daycare") {
      const [bx, by] = P(fp.x1 - 2, fp.y1 + 2, 0), [tx, ty] = P(fp.x1 - 2, fp.y1 + 2, fp.h + 10);
      ctx.strokeStyle = "#c9ced4"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = t === "daycare" ? "#e8b73a" : "#3f6fb0"; ctx.fillRect(tx, ty, 6, 4);
    }
    if (t === "hospital") {
      const cx = (fp.x0 + fp.x1) / 2, cy = (fp.y0 + fp.y1) / 2, z = fp.h + 0.1;
      for (const [a, bb] of [[7, 2.2], [2.2, 7]]) this.poly([P(cx - a, cy - bb, z), P(cx + a, cy - bb, z), P(cx + a, cy + bb, z), P(cx - a, cy + bb, z)], mix("#5a1d1d", "#c8413b", dl));
    }
    const awning = { bar: "#6b3a1e", salon: "#7a4d6a", clothing_store: "#1c1c1c", pharmacy: "#2f6b55", restaurant: "#7a1f2b", laundromat: "#3f6fb0", coffee_shop: "#2f5a43", boutique: "#1c1c1c" }[t];
    if (awning) { const z = 4.5; this.poly([P(fp.x0, fp.y1, z + 2), P(fp.x1, fp.y1, z + 2), P(fp.x1, fp.y1 + 3, z), P(fp.x0, fp.y1 + 3, z)], awning); }
    if (t === "bar" && open && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h), P(fp.x1, fp.y1, fp.h)], null, `rgba(255,170,90,${0.55 + 0.3 * Math.sin(now / 500)})`); }
    if (t === "church") {
      const sx = fp.x0 + 4, sy = fp.y1 - 6; this.drawBox({ x0: sx - 3, x1: sx + 3, y0: sy - 3, y1: sy + 3, h: fp.h + 14 }, cols, { night: 0 });
      this.poly([P(sx - 3, sy - 3, fp.h + 14), P(sx + 3, sy + 3, fp.h + 14), P(sx, sy, fp.h + 24)], cols[2]);
    }
    if (t === "nightclub" && night > 0.3) { ctx.lineWidth = 2; this.poly([P(fp.x0, fp.y1, fp.h), P(fp.x1, fp.y1, fp.h), P(fp.x1, fp.y0, fp.h)], null, `rgba(255,80,190,${0.5 + 0.4 * Math.sin(now / 300)})`); }
    const top = [P(fp.x0, fp.y0, fp.h), P(fp.x1, fp.y0, fp.h), P(fp.x1, fp.y1, fp.h), P(fp.x0, fp.y1, fp.h)];
    this.hit.push({ kind: "place", id: b.id, poly: [P(fp.x0, fp.y1, 0), P(fp.x1, fp.y1, 0), P(fp.x1, fp.y0, 0), top[1], top[0], top[3]] });
    if (sel) { ctx.lineWidth = 2; this.poly(top, null, "#f3d9a4"); }
  }

  drawPerson(c, night) {
    const ctx = this.ctx, sx = c.sx0 + c.dx, sy = c.sy0 + c.dy, r = this.pr, lift = r * 1.9;
    if (c.bus) {
      const bw = r * 3.4, bh = r * 1.5;
      ctx.fillStyle = "#3f8fa8"; ctx.beginPath(); ctx.roundRect(sx - bw / 2, sy - bh, bw, bh, 4); ctx.fill();
      ctx.fillStyle = night > 0.3 ? "rgba(255,226,160,.9)" : "rgba(220,240,248,.85)";
      for (let i = 0; i < 4; i++) ctx.fillRect(sx - bw / 2 + 4 + i * (bw - 8) / 4, sy - bh + 3, (bw - 8) / 4 - 2, bh * 0.35);
      ctx.fillStyle = "#1c1c1c"; for (const wx of [sx - bw / 3, sx + bw / 3]) { ctx.beginPath(); ctx.arc(wx, sy, 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.7, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(239,231,220,.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - lift + r); ctx.stroke();
    const cy = sy - lift;
    ctx.save(); ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    const im = this.face(c.id);
    if (im) ctx.drawImage(im, sx - r, cy - r, r * 2, r * 2);
    else {
      const gg = ctx.createRadialGradient(sx - r / 3, cy - r / 3, 1, sx, cy, r); gg.addColorStop(0, "#d9874e"); gg.addColorStop(1, "#8a4524");
      ctx.fillStyle = gg; ctx.fillRect(sx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = "#fff3e6"; ctx.font = `600 ${Math.round(r * 0.8)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(initials(c.name), sx, cy + 1);
    }
    ctx.restore();
    const sel = this.selected && this.selected.kind === "person" && this.selected.id === c.id;
    ctx.lineWidth = c.self ? 3 : 2;
    ctx.strokeStyle = sel ? "#f3d9a4" : c.self ? "#cfae74" : c.inside ? "#cfae74" : "#efe7dc";
    if (c.scripted && !sel) ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    c.screen = [sx, cy, r];
    if (!c.self) this.hit.push({ kind: "person", id: c.id, circle: [sx, cy, Math.max(22, r + 6)] });
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
    this.poly(pts, vol === "shout" ? "rgba(224,154,154,.10)" : "rgba(207,174,116,.10)", vol === "shout" ? "rgba(224,154,154,.85)" : "rgba(243,217,164,.85)");
    ctx.setLineDash([]);
  }

  drawWeather(wx, now, dl) {
    if (!wx) return;
    const ctx = this.ctx, cw = this.cw, ch = this.ch;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, tt = reduce ? 0 : now / 1000;
    if (wx.kind === "rain" || wx.kind === "storm") {
      ctx.fillStyle = `rgba(40,50,70,${wx.kind === "storm" ? 0.22 : 0.12})`; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = `rgba(200,215,235,${0.25 + 0.2 * dl})`; ctx.lineWidth = 1;
      const n = wx.kind === "storm" ? 220 : 130; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = ((i * 97.3) % cw + tt * 60) % cw, y = ((i * 53.7) % ch + tt * (520 + (i % 5) * 40)) % ch; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 11); }
      ctx.stroke();
      if (wx.kind === "storm" && !reduce && Math.sin(now / 1700) > 0.985) { ctx.fillStyle = "rgba(235,240,255,.35)"; ctx.fillRect(0, 0, cw, ch); }
    } else if (wx.kind === "snow") {
      ctx.fillStyle = "rgba(232,238,248,.22)"; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "rgba(245,248,255,.85)";
      for (let i = 0; i < 160; i++) { const x = ((i * 71.9) % cw + Math.sin(tt + i) * 8 + tt * 10) % cw, y = ((i * 41.3) % ch + tt * (40 + (i % 4) * 10)) % ch; ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill(); }
    } else if (wx.kind === "cloud") { ctx.fillStyle = "rgba(60,66,76,.10)"; ctx.fillRect(0, 0, cw, ch); }
  }

  bubble(x, y, text, style) {
    const ctx = this.ctx, cw = this.cw;
    ctx.font = `${style === "whisper" || style === "whispering" ? "italic " : ""}${style === "shout" ? 700 : 500} ${style === "shout" ? 14 : 12}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const maxW = Math.min(220, cw * 0.6), words = String(text).split(" "), lines = [];
    let line = "";
    for (const wd of words) { const test = line ? line + " " + wd : wd; if (ctx.measureText(test).width > maxW - 16 && line) { lines.push(line); line = wd; } else line = test; }
    lines.push(line);
    const shown = lines.slice(0, 4); if (lines.length > 4) shown[3] += " …";
    const w = Math.min(maxW, Math.max(...shown.map(l => ctx.measureText(l).width)) + 18), hh = shown.length * 15 + 12;
    const bx = Math.max(6, Math.min(cw - w - 6, x - w / 2)), by = Math.max(6, y - hh - 10);
    const dark = style === "whisper" || style === "whispering";
    ctx.fillStyle = dark ? "rgba(14,12,11,.88)" : "rgba(250,246,238,.97)";
    ctx.beginPath(); ctx.roundRect(bx, by, w, hh, 10); ctx.fill();
    if (dark) { ctx.setLineDash([4, 3]); ctx.strokeStyle = "#efe7dc"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
    if (style === "shout") { ctx.strokeStyle = "#e09a9a"; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - 5, by + hh); ctx.lineTo(x + 5, by + hh); ctx.lineTo(x, by + hh + 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark ? "#efe7dc" : "#1c1814"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    shown.forEach((l, i) => ctx.fillText(l, bx + 9, by + 6 + i * 15));
  }
  drawBubbles(people, now) {
    const pos = new Map(people.filter(p => p.screen).map(p => [p.id, p.screen]));
    for (const b of this.world.liveBubbles(now)) {
      let x, y, r = 0;
      const sp = pos.get(b.who);
      if (sp) [x, y, r] = sp;
      else if (b.pos) [x, y] = this.P(b.pos[0], b.pos[1], 18);
      else continue;  // the speech log under the map shows it
      const text = b.kind === "whispering" ? `whispering to ${b.toName}` : b.text;
      this.bubble(x, y - r, text, b.kind === "whispering" ? "whispering" : b.volume);
    }
  }
}
