// The one way the game draws a whole person: on the map (render2d.js) and inside a building
// (interior.js). Characters with a sprite sheet from the owner (art/sprites/characters/<id>/sheet.webp)
// are drawn with its frames (client/figures/<id>/<frame>.webp, cut by scripts/client_figures.py, D-072):
// a four-frame walk toward the camera and one away from it, standing, and seated on a chair and on a sofa,
// all at the town's camera. The other founders and residents with a model sheet are drawn with their
// full-body cut-outs (client/figures/<id>/<view>.webp, cut from art/reference); everyone else (characters
// made in the creator, scripts' characters) is drawn as a simple stylised body in canvas, which is a
// stand-in, not their look: the protocol doesn't tell other players what anyone chose in the creator, so
// its colours are neutral and its outfit colour is picked by the client from the person's id, only so two
// of them can be told apart.
//
//   drawFigure(ctx, person, x, y, {height, facing, mirror, pose, phase, night, selected, scripted, seat, seatKind})
//
// person: the client's person object ({id, name, …}). (x, y): where the feet stand, in the
// context's current units. height: how tall a 1.75 m person stands there, in the same units;
// each character keeps their own real height relative to it (Dax, 1.88 m, comes out 7% taller).
// facing: front | front34 | side | back34 | back (facingFor() picks it from a movement on screen).
// mirror: false = the person faces screen-right, true = screen-left (in a side or three-quarter
// view); each picture is flipped as its own art needs. pose: stand | walk | sit | fight | flinch.
// phase: the walk cycle (one cycle = two steps; only its fraction is used), the fight's bounce, or
// how far through a flinch (0 → 1: the shake dies away). night: 0..1, how far the light has
// gone to the map's night. selected: a gold ring on the ground. scripted: the dashed ring that says
// a script plays them. Extra, optional: tint ([hex, 0..1], the hour's warm light at golden hour),
// seat (sit: how far above the feet the seat is, default 0.26 of the height), seatKind (sit: the kind
// of seat, as the rooms name them: seat, stool, sofa, bed).
//
// A sprite sheet's frames are three-quarter views: walking and standing toward the camera use the
// front frames, away from it the back ones, each mirrored for the other diagonal (a straight-on or side
// direction takes the nearer three-quarter one). Walking steps through the walk frames, four to a step.
// Sitting facing the camera is the real seated frame, its seat point (where the seat is under the hips,
// found by the script) put on the seat: sit_chair on chairs, stools and seats, sit_sofa on sofas and beds.
// The sheets have no seated frame from behind, so someone sitting with their back to the camera (at a
// bar, a desk, the near side of a table) is the standing back frame lowered onto the seat and clipped at
// the seat line, the furniture drawn in front reading as the seat; from behind, the back and the seat
// hide the legs anyway. The seat height for each kind of seat and any nudge of the seated frames are in
// the manifest's "$seats" (from the script), not per room.
//
// The cut-outs approximate everything but standing: walking is a bob and a sway; sitting lowers the
// figure so its hips meet the seat and clips it at the seat line, so whatever is drawn in front of it
// afterwards (a chair's front, a table, a sofa's arm) reads as the seat; the legs aren't drawn.
// Fighting and flinching are the same kind of approximation for every picture: a picture can't raise
// its fists, so "fight" squares the standing figure up (a slight crouch, a lean toward the way they
// face, a boxer's bounce) and "flinch" recoils it (a crouch, a lean away, a shake that dies away);
// the stand-in body does raise its fists, or its arms over its face.
//
// Scaled, lit pictures are cached per (id, view or frame, height bucket, light step), so a frame costs
// one drawImage per person (16 people: about 0.15 ms); while zooming, at most four are baked again per
// frame and the rest draw their last bake scaled.

export const REFERENCE_CM = 175;
const DEFAULT_CM = 172;            // nobody tells the client how tall a created character is
const VIEWS = ["front", "front34", "side", "back34", "back"];
// The nearest view a character has, for each one wanted (the collage sheets have only "front" and
// "back34"; the four-view turnarounds have no "back34").
const FALLBACK = {
  front: ["front", "front34", "side", "back34", "back"],
  front34: ["front34", "front", "side", "back34", "back"],
  side: ["side", "front34", "front", "back34", "back"],
  back34: ["back34", "back", "side", "front34", "front"],
  back: ["back", "back34", "side", "front34", "front"],
};
const NIGHT_COLOR = "#061a22";     // layout.js LIGHT's night ambient
const NIGHT_MAX = 0.45;            // how dark a person gets at full night (the street lamps keep them readable)
const SIT_SEAT = 0.26, SIT_HIP = 0.52;   // seat height and hip height, as fractions of a standing person
// A sprite sheet's frames (art/PROMPT_PACK_CHARACTERS.md, "How a sheet replaces the cut-outs").
const WALK = n => Array.from({ length: n }, (_, i) => i + 1);
const FRAMES = [...WALK(4).map(i => `walk_front34_${i}`), ...WALK(4).map(i => `walk_back34_${i}`), "idle_front34", "idle_back34", "sit_chair", "sit_sofa"];
const SOFT_SEATS = new Set(["sofa", "bed"]);   // sit_sofa; every other seat (seat, stool, chair) sit_chair
// Per kind of seat: how high the seat is (fraction of a standing 1.75 m person), a nudge of the seated frame's seat
// point (fractions of the person's height: dx toward the way they face, dy down), and how far ahead of the seat the
// furniture it belongs to covers the legs (reach, fraction of the height: a booth's own table; interior.js). The
// manifest's "$seats" replaces these defaults; a kind it doesn't name (a new kind of spot) is a plain seat.
const SEAT_DEFAULTS = { seat: { height: 0.26, dx: 0, dy: 0, reach: 0.22 }, stool: { height: 0.42, dx: 0, dy: 0, reach: 0.22 },
  sofa: { height: 0.24, dx: 0, dy: 0, reach: 0.22 }, bed: { height: 0.3, dx: 0, dy: 0, reach: 0.22 } };
let seats = SEAT_DEFAULTS;

let manifest = null, loading = null;
const pictures = new Map();        // "id/view" -> {img, ok}
const baked = new Map();           // cache key -> canvas
const BAKED_MAX = 360;

const isId = s => typeof s === "string" && /^[a-z0-9_-]{1,64}$/.test(s);
const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

// The manifest of cut-outs: which characters and views exist, their sizes and feet. Only ids and
// views listed here are ever requested. Called lazily by drawFigure(); call it yourself to start early.
export function loadFigureManifest() {
  if (!loading) {
    loading = fetch("figures/manifest.json", { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : {}))
      .then(m => {
        const out = new Map();
        const pt = a => (Array.isArray(a) && a.length === 2 && a.every(v => isFinite(Number(v))) ? a.map(Number) : null);
        const pictureOf = d => {
          if (!d || !Array.isArray(d.size)) return null;
          const [w, h] = d.size.map(Number), foot = pt(d.foot), seat = pt(d.seat);
          if (!(w > 0 && h > 0) || !(foot || seat)) return null;
          const [fx, fy] = seat || foot;
          return { w, h, fx, fy, seat: !!seat, faces: d.faces === "left" || d.faces === "right" ? d.faces : null };
        };
        for (const [id, e] of Object.entries(m && typeof m === "object" ? m : {})) {
          if (!isId(id) || !e || typeof e !== "object") continue;
          const views = {}, frames = {};
          for (const v of VIEWS) { const p = e.views && typeof e.views === "object" ? pictureOf(e.views[v]) : null; if (p && !p.seat) views[v] = p; }
          for (const f of FRAMES) { const p = e.frames && typeof e.frames === "object" ? pictureOf(e.frames[f]) : null; if (p && p.seat === f.startsWith("sit_")) frames[f] = p; }
          const sheet = !!(frames.idle_front34 || frames.idle_back34);
          if (Object.keys(views).length || sheet) {
            out.set(id, { cm: num(e.height_cm, DEFAULT_CM), pxPerCm: num(e.px_per_cm, 360 / REFERENCE_CM), views, frames: sheet ? frames : null });
          }
        }
        const sm = m && m.$seats;
        if (sm && typeof sm === "object") {
          seats = {};
          for (const [k, d] of Object.entries({ ...SEAT_DEFAULTS, ...sm })) {
            if (!/^[a-z_]{1,20}$/.test(k) || !d || typeof d !== "object") continue;
            const def = SEAT_DEFAULTS[k] || SEAT_DEFAULTS.seat;
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            seats[k] = { height: clamp(num(d.height, def.height), 0.05, 0.8), dx: clamp(num(d.dx, 0), -0.3, 0.3), dy: clamp(num(d.dy, 0), -0.3, 0.3),
              reach: clamp(num(d.reach, def.reach), 0, 2) };
          }
        }
        manifest = out;
      })
      .catch(() => { manifest = new Map(); });
  }
  return loading;
}
// How high a kind of seat is, as a fraction of a standing 1.75 m person (the rooms put people on seats with it).
export const seatHeight = kind => seatTune(kind).height;
// Everything the manifest says about a kind of seat: {height, dx, dy, reach}.
export const seatTune = kind => seats[kind] || seats.seat || SEAT_DEFAULTS.seat;

function entry(id) { return manifest && manifest.get(id) || null; }

function picture(id, view) {
  const key = `${id}/${view}`;
  let p = pictures.get(key);
  if (!p) {
    p = { img: new Image(), ok: false, failed: false };
    p.img.decoding = "async";
    p.img.onload = () => { p.ok = true; };
    p.img.onerror = () => { p.failed = true; };
    p.img.src = `figures/${encodeURIComponent(id)}/${view}.webp`;
    pictures.set(key, p);
  }
  return p.ok ? p.img : null;
}

// Starts loading every view of a character at once, so turning around never shows a gap.
const fetched = new Set();
function prefetch(id, e) {
  if (fetched.has(id)) return;
  fetched.add(id);
  for (const v of Object.keys(e.views)) picture(id, v);
  for (const f of Object.keys(e.frames || {})) picture(id, f);
}
// Has this character's art loaded (their front view, or the first they have)? Starts loading it.
export function figureReady(id) {
  if (!manifest) { loadFigureManifest(); return false; }
  const e = entry(id);
  if (!e) return false;
  prefetch(id, e);
  const first = e.frames ? (e.frames.idle_front34 ? "idle_front34" : "idle_back34") : e.views.front ? "front" : Object.keys(e.views)[0];
  return !!picture(id, first);
}
// Whether a character has cut-outs at all (false until the manifest has loaded).
export const hasFigure = id => !!entry(id);
// How tall a character is drawn, in cm (their sheet's height; created characters a neutral 172).
export const figureHeightCm = person => (person && entry(person.id) ? entry(person.id).cm : num(person && person.height_cm, DEFAULT_CM));

// The view and mirror for a movement on screen (dx, dy in screen units, y down). Walking along the
// map's streets is a three-quarter view (front34 coming toward the camera, back34 going away).
export function facingFor(dx, dy, fallback = { facing: "front", mirror: false }) {
  if (!(Math.abs(dx) + Math.abs(dy) > 1e-6)) return fallback;
  const a = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
  const facing = a > 67.5 ? "front" : a > 22.5 ? "front34" : a >= -22.5 ? "side" : a >= -67.5 ? "back34" : "back";
  return { facing, mirror: dx < 0 };
}

// ------------------------------------------------------------------------------ drawing
const mixHex = (a, b, k) => {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("");
};
const deviceScale = ctx => { try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch { return 1; } };
// Heights are baked in buckets: every device pixel while small, then steps of 5%.
const bucket = hd => (hd < 48 ? Math.max(4, Math.round(hd)) : Math.round(48 * Math.pow(1.05, Math.round(Math.log(hd / 48) / Math.log(1.05)))));

function remember(key, canvas, near) {
  if (baked.size >= BAKED_MAX) baked.delete(baked.keys().next().value);
  baked.set(key, canvas);
  nearest.set(near, canvas);
  return canvas;
}
// While a pinch or the wheel zooms, every figure would be baked again every frame; at most a few
// are, and the others use their last bake (any size, drawn scaled) until their turn comes.
const nearest = new Map();         // id|view -> the last canvas baked for it (any light: it stands in for a frame or two)
let tick = 0, bakesInTick = 0;
function mayBake() {
  const t = performance.now();
  if (t - tick > 12) { tick = t; bakesInTick = 0; }
  return bakesInTick++ < 4;
}
// Lights a baked picture: the night's dark and the hour's tint, on the figure's pixels only.
function light(g, w, h, nightStep, tint) {
  g.globalCompositeOperation = "source-atop";
  if (tint && tint[1] > 0) { g.globalAlpha = tint[1]; g.fillStyle = tint[0]; g.fillRect(0, 0, w, h); }
  if (nightStep > 0) { g.globalAlpha = nightStep * NIGHT_MAX; g.fillStyle = NIGHT_COLOR; g.fillRect(0, 0, w, h); }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}
// The cut-out at `hd` device pixels for a 1.75 m person, scaled down in halves (no shimmer, no
// aliasing at the small sizes the map draws people at) and lit.
function bakeArt(id, view, info, img, hd, nightStep, tint) {
  const near = `a|${id}|${view}`, key = `${near}|${nightStep}|${tint ? tint.join() : ""}|${hd}`;
  let c = baked.get(key);
  if (c) { baked.delete(key); baked.set(key, c); return c; }
  if (nearest.has(near) && !mayBake()) return nearest.get(near);
  const k = hd / (REFERENCE_CM * info.pxPerCm);
  const W = Math.max(1, Math.round(info.v.w * k)), H = Math.max(1, Math.round(info.v.h * k));
  let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw > W * 2.2) {
    const nw = Math.ceil(sw / 2), nh = Math.ceil(sh / 2), t = document.createElement("canvas");
    t.width = nw; t.height = nh;
    const tg = t.getContext("2d");
    tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = "high";
    tg.drawImage(src, 0, 0, nw, nh);
    src = t; sw = nw; sh = nh;
  }
  c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, W, H);
  light(g, W, H, nightStep, tint);
  c.k = k; c.hd = hd;
  return remember(key, c, near);
}

// The stand-in body for someone without art, drawn into a canvas `hd` device pixels for a 1.75 m
// person: neutral skin and hair, an outfit colour from the town's palette chosen by id, a soft side
// shade and a thin dark outline so it reads on light paving and on dark grass alike.
const OUTFITS = [["#2e4636", "#3b3a36"], ["#884f2d", "#2f2a26"], ["#0b2b23", "#c9b48f"], ["#b48a4c", "#2b2f2d"], ["#5e4a66", "#3a3631"], ["#ad734e", "#26302c"], ["#e8dcc4", "#4a4038"]];
const SKIN = "#b48e72", HAIR = "#3a2f29", SHOE = "#2a2420";
function seededIndex(id, n) { let h = 0; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % n; }
function bodyShape(g, H, W, view, outfit, frame, arms = "") {
  const cx = W / 2, top = 2, u = H / 7.4;   // a head unit; adults are about 7.4 heads tall
  const side = view === "side", back = view === "back" || view === "back34", three = view === "front34" || view === "back34";
  const shoulder = side ? u * 0.6 : three ? u * 0.86 : u * 0.98, hip = side ? u * 0.56 : three ? u * 0.68 : u * 0.74;
  const swing = frame < 0 ? 0 : Math.sin(frame / 8 * Math.PI * 2);
  const neckY = top + u * 1.05, shY = top + u * 1.42, waistY = top + u * 3.25, footY = top + H;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); g.fill(); };
  // Legs, stepping when walking (in a side view they swing front and back), and shoes.
  const legW = side ? u * 0.44 : u * 0.4, stepX = swing * u * (side ? 0.6 : 0.1), lift = s => (s > 0 ? Math.max(0, swing) : Math.max(0, -swing)) * u * 0.12;
  const legX = s => (side ? cx - legW / 2 + s * stepX : cx + s * hip * 0.52 - legW / 2 + (three ? u * 0.08 * s : 0));
  for (const s of [-1, 1]) {
    g.fillStyle = s < 0 && side ? mixHex(outfit[1], "#000000", 0.2) : outfit[1];
    rr(legX(s), waistY - u * 0.1, legW, footY - waistY - u * 0.12 - lift(s), legW * 0.3);
    g.fillStyle = SHOE;
    rr(legX(s) - (side ? u * 0.02 : u * 0.03), footY - u * 0.2 - lift(s), legW + (side ? u * 0.26 : u * 0.06), u * 0.2, u * 0.09);
  }
  // Arms behind the torso in a side view; beside it otherwise, swinging against the legs.
  const arm = (s, behind) => {
    const ax = side ? cx - u * 0.17 - s * swing * u * 0.32 : cx + s * (shoulder - u * 0.1) - u * 0.17 + (back ? 0 : 0);
    g.fillStyle = behind ? mixHex(outfit[0], "#000000", 0.25) : outfit[0];
    rr(ax, shY - u * 0.02, u * 0.34, u * 1.75, u * 0.17);
    g.fillStyle = behind ? mixHex(SKIN, "#000000", 0.2) : SKIN;
    g.beginPath(); g.ellipse(ax + u * 0.17, shY + u * 1.86, u * 0.15, u * 0.2, 0, 0, Math.PI * 2); g.fill();
  };
  // Raised arms (fight: fists up at the chin; flinch: forearms crossed over the face), as bent strokes.
  const raised = (s, behind) => {
    const shx = side ? cx + u * 0.05 : cx + s * (shoulder - u * 0.12), shy = shY + u * 0.12;
    const elx = side ? cx + u * (behind ? 0.25 : 0.45) : cx + s * (shoulder + u * 0.05), ely = shY + u * 1.0;
    const fx = arms === "cover" ? (side ? cx + u * 0.55 : cx - s * u * 0.12) : side ? cx + u * (behind ? 0.45 : 0.7) : cx + s * u * 0.32;
    const fy = arms === "cover" ? top + u * 0.62 : top + u * (behind ? 1.25 : 1.15);
    g.strokeStyle = behind ? mixHex(outfit[0], "#000000", 0.25) : outfit[0]; g.lineWidth = u * 0.32; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(shx, shy); g.lineTo(elx, ely); g.lineTo(fx, fy + u * 0.12); g.stroke();
    g.fillStyle = behind ? mixHex(SKIN, "#000000", 0.2) : SKIN;
    g.beginPath(); g.arc(fx, fy, u * 0.17, 0, Math.PI * 2); g.fill();
  };
  if (side && !arms) arm(-1, true);
  if (side && arms) raised(-1, true);
  if (back && arms) { raised(-1, true); raised(1, true); }   // from behind only the elbows show
  // Torso: shoulders, a slight waist, the top's hem over the trousers.
  g.fillStyle = outfit[0];
  g.beginPath();
  g.moveTo(cx - shoulder, shY + u * 0.2);
  g.quadraticCurveTo(cx - shoulder, shY - u * 0.12, cx - shoulder + u * 0.3, shY - u * 0.14);
  g.lineTo(cx + shoulder - u * 0.3, shY - u * 0.14);
  g.quadraticCurveTo(cx + shoulder, shY - u * 0.12, cx + shoulder, shY + u * 0.2);
  g.quadraticCurveTo(cx + hip * 0.86, waistY - u * 0.6, cx + hip, waistY + u * 0.2);
  g.lineTo(cx - hip, waistY + u * 0.2);
  g.quadraticCurveTo(cx - hip * 0.86, waistY - u * 0.6, cx - shoulder, shY + u * 0.2);
  g.closePath(); g.fill();
  if (arms && !back) {
    // Neck and head go on first here: the raised arms come in front of them.
    headAndHair(); if (side) raised(1, false); else { raised(-1, false); raised(1, false); }
  } else {
    if (!arms) { if (!side) { arm(-1, false); arm(1, false); } else arm(1, false); }
    headAndHair();
  }
  // A soft shade on the side away from the light.
  g.globalCompositeOperation = "source-atop";
  const sh = g.createLinearGradient(cx - shoulder, 0, cx + shoulder, 0);
  sh.addColorStop(0, "rgba(255,240,215,0.10)"); sh.addColorStop(0.55, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(20,12,6,0.22)");
  g.fillStyle = sh; g.fillRect(0, 0, W, footY + 2);
  g.globalCompositeOperation = "source-over";
  return { fx: cx, fy: footY };
  // Neck and head; hair over the top (all of it from behind, the back of it from the side).
  function headAndHair() {
    g.fillStyle = SKIN;
    rr(cx - u * 0.15 + (side ? u * 0.05 : 0), neckY - u * 0.15, u * 0.3, u * 0.45, u * 0.1);
    const hx = cx + (side ? u * 0.1 : three ? (back ? -u * 0.03 : u * 0.03) : 0), hy = top + u * 0.56;
    g.beginPath(); g.ellipse(hx, hy, u * (side ? 0.42 : 0.38), u * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = HAIR;
    g.beginPath();
    if (back) g.ellipse(hx, hy - u * 0.04, u * 0.42, u * 0.52, 0, 0, Math.PI * 2);
    else if (side) g.ellipse(hx - u * 0.12, hy - u * 0.14, u * 0.4, u * 0.4, 0.3, Math.PI * 0.75, Math.PI * 2.1);
    else g.ellipse(hx, hy - u * 0.14, u * 0.42, u * 0.4, 0, Math.PI * 0.98, Math.PI * 2.02);
    g.fill();
  }
}
function bakeBody(person, view, cm, hd, nightStep, tint, frame, arms = "") {
  const outfit = OUTFITS[seededIndex(person && person.id, OUTFITS.length)];
  const near = `b|${outfit.join()}|${view}|${cm}|${frame}|${arms}`, key = `${near}|${nightStep}|${tint ? tint.join() : ""}|${hd}`;
  let c = baked.get(key);
  if (c) return c;
  if (nearest.has(near) && !mayBake()) return nearest.get(near);
  const H = hd * cm / REFERENCE_CM, W = Math.ceil(H * 0.42) + 6, CH = Math.ceil(H) + 5;
  const shape = document.createElement("canvas");
  shape.width = W; shape.height = CH;
  const sg = shape.getContext("2d");
  const { fx, fy } = bodyShape(sg, H, W, view, outfit, frame, arms);
  // The outline: the silhouette in dark, nudged around, under the figure.
  c = document.createElement("canvas");
  c.width = W; c.height = CH;
  const g = c.getContext("2d"), o = Math.max(0.7, H / 160);
  const sil = document.createElement("canvas");
  sil.width = W; sil.height = CH;
  const lg = sil.getContext("2d");
  lg.drawImage(shape, 0, 0); lg.globalCompositeOperation = "source-in"; lg.fillStyle = "rgba(24,18,12,0.75)"; lg.fillRect(0, 0, W, CH);
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) g.drawImage(sil, dx, dy);
  g.drawImage(shape, 0, 0);
  light(g, W, CH, nightStep, tint);
  c.k = 1; c.fx = fx; c.fy = fy; c.hd = hd;
  return remember(key, c, near);
}

function groundRings(ctx, x, y, h, selected, scripted) {
  const rx = Math.max(12, h * 0.27), ry = Math.max(5, rx * 0.4);
  if (selected) {
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(11,43,35,.55)"; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = "#e8cf9c"; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (scripted) {
    const k = selected ? 1.3 : 1;
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(247,236,214,.9)"; ctx.setLineDash([3, 2.5]);
    ctx.beginPath(); ctx.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(11,43,35,.45)"; ctx.beginPath(); ctx.ellipse(x, y, rx * k + 1.5, ry * k + 1.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

// Which of a sprite sheet's frames shows a pose, and how it is anchored: "foot" (the point between the
// feet on the ground), "seat" (a seated frame's seat point on the seat), or "lowered" (the standing frame
// lowered onto the seat and clipped there: sitting with the back to the camera, which no frame shows).
function sheetFrame(frames, pose, want, cyc, seatKind) {
  const back = want === "back34" || want === "back", side = back ? "back34" : "front34";
  const idle = frames[`idle_${side}`] ? `idle_${side}` : frames.idle_front34 ? "idle_front34" : "idle_back34";
  if (pose === "sit") {
    const f = SOFT_SEATS.has(seatKind) ? "sit_sofa" : "sit_chair";
    if (!back && frames[f]) return { name: f, mode: "seat" };
    if (!back && frames.sit_chair) return { name: "sit_chair", mode: "seat" };
    return { name: idle, mode: "lowered" };
  }
  if (pose === "walk") {
    const f = `walk_${side}_${1 + (Math.floor(cyc * 8) % 4)}`;   // four frames a step, two steps a cycle
    if (frames[f]) return { name: f, mode: "foot" };
  }
  return { name: idle, mode: "foot" };
}

// Draws `person` with their feet at (x, y). Returns where it went: {x0, y0, x1, y1} (the figure's
// box, for tap targets), `head` (the top of the head), in the context's units, and for a sprite sheet the
// frame drawn (`frame`) and how it was anchored (`mode`: foot, seat or lowered).
export function drawFigure(ctx, person, x, y, { height, facing = "front", mirror = false, pose = "stand", phase = 0, night = 0,
  selected = false, scripted = false, tint = null, seat = null, seatKind = null } = {}) {
  if (!manifest) loadFigureManifest();
  const ref = Math.max(1, num(height, 60)), dev = deviceScale(ctx);
  const id = person && person.id, e = isId(id) ? entry(id) : null;
  const cm = e ? e.cm : num(person && person.height_cm, DEFAULT_CM), h = ref * cm / REFERENCE_CM;
  const nightStep = Math.round(Math.max(0, Math.min(1, num(night, 0))) * 12) / 12;
  const t = tint && typeof tint[0] === "string" && /^#[0-9a-f]{6}$/i.test(tint[0]) && tint[1] > 0.01 ? [tint[0].toLowerCase(), Math.round(Math.min(0.6, tint[1]) * 20) / 20] : null;
  const hd = bucket(ref * dev);
  const want = VIEWS.includes(facing) ? facing : "front";
  const cyc = ((num(phase, 0) % 1) + 1) % 1, walking = pose === "walk", sitting = pose === "sit";
  const seatH = sitting ? num(seat, ref * SIT_SEAT) : 0;
  // Fighting: squared up and bouncing on the toes; flinching: recoiling, with a shake that dies away.
  const fighting = pose === "fight", flinching = pose === "flinch", turned = want !== "front" && want !== "back", toward = mirror ? -1 : 1;
  const squash = fighting ? 0.97 : flinching ? 0.95 : 1;
  const hop = fighting ? -Math.abs(Math.sin(cyc * Math.PI * 4)) * h * 0.015 : 0;
  const shake = flinching ? Math.sin(cyc * Math.PI * 6) * h * 0.015 * (1 - cyc) : 0;
  let img = null, view = want, info = null, mode = sitting ? "lowered" : "foot";
  if (e) {
    prefetch(id, e);
    if (e.frames) {
      // The frame the pose wants; while it loads, the standing frame that side (or any loaded one) rather than a gap.
      const f = sheetFrame(e.frames, pose, want, cyc, seatKind), still = sheetFrame(e.frames, "stand", want, 0);
      const tries = [f, { name: still.name, mode: sitting ? "lowered" : "foot" },
        ...Object.keys(e.frames).filter(n => !n.startsWith("sit_")).map(n => ({ name: n, mode: sitting ? "lowered" : "foot" }))];
      for (const c of tries) { const im = picture(id, c.name); if (im) { img = im; view = c.name; mode = c.mode; break; } }
      if (img) info = { v: e.frames[view], pxPerCm: e.pxPerCm };
    } else {
      for (const v of FALLBACK[want]) if (e.views[v]) { const im = picture(id, v); if (im) { img = im; view = v; break; } }
      if (img) info = { v: e.views[view], pxPerCm: e.pxPerCm };
    }
  }
  const sheet = !!(e && e.frames && img);
  // The cut-outs and the stand-in walk with a step's bob and a slight sway about the feet; a sheet's frames walk.
  const bob = walking && !sheet ? -Math.abs(Math.sin(cyc * Math.PI * 2)) * h * 0.014 : 0;
  const sway = walking && !sheet ? Math.sin(cyc * Math.PI * 2) * 0.018 : 0;
  const lean = fighting ? (turned ? 0.05 : 0) * toward : flinching ? (turned ? -0.09 : 0) * toward : 0;
  const drop = mode === "lowered" ? h * SIT_HIP - seatH : 0;
  // A soft contact shadow (none while seated: the seat has its own).
  if (!sitting) {
    const sw = h * (view === "side" ? 0.2 : 0.26), sh = Math.max(1.5, h * 0.055);
    ctx.fillStyle = `rgba(40,28,14,${(0.3 - 0.12 * nightStep).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x, y, sw, sh, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (selected || scripted) groundRings(ctx, x, y, h, selected, scripted);
  // Art that is still on its way (or the manifest saying who has art): just the shadow for a moment,
  // rather than a stand-in body that then turns into the person. Art that failed to load: the stand-in.
  const loadingArt = e && [...Object.keys(e.views), ...Object.keys(e.frames || {})].some(v => !pictures.get(`${id}/${v}`)?.failed);
  if (!img && (!manifest || loadingArt)) {
    return { x0: x - h * 0.15, y0: y - h, x1: x + h * 0.15, y1: y, head: [x, y - h], height: h, view: want, art: false, pending: true };
  }
  let c, fx, fy, k;
  if (img) {
    c = bakeArt(id, view, info, img, hd, nightStep, t);
    k = ref / c.hd;                                 // baked device px -> context units
    const s = c.k;                                  // picture px -> baked px
    fx = info.v.fx * s; fy = info.v.fy * s;
  } else {
    const frame = walking ? Math.floor(cyc * 8) : -1;
    c = bakeBody(person, want, cm, hd, nightStep, t, frame, fighting ? "guard" : flinching ? "cover" : "");
    k = ref / c.hd; fx = c.fx; fy = c.fy;
    view = want;
  }
  // Which way the picture looks, against which way the person faces.
  const faces = info ? info.v.faces : (view === "side" || view === "front34" || view === "back34" ? "right" : null);
  const flip = faces ? (faces === "right") === !!mirror : false;
  // Where the picture's anchor goes: the feet on (x, y), or a seated frame's seat point on the seat, nudged as
  // the manifest says for this kind of seat (its dx is toward the way the person faces).
  let ax = x + shake, ay = y + drop + bob + hop;
  if (mode === "seat") {
    const tune = seatTune(seatKind);
    ax = x + tune.dx * h * (mirror ? -1 : 1); ay = y - seatH + tune.dy * h;
  }
  const w = c.width * k, hh = c.height * k;
  ctx.save();
  if (mode === "lowered") { ctx.beginPath(); ctx.rect(x - w, y - hh - h - 2, w * 2, hh + h + 2 - seatH); ctx.clip(); }
  ctx.translate(ax, ay);
  if (sway || lean) ctx.rotate(sway + lean);
  if (flip || squash !== 1) ctx.scale(flip ? -1 : 1, squash);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, -fx * k, -fy * k, w, hh);
  ctx.restore();
  const x0 = ax - (flip ? w - fx * k : fx * k), y0 = ay - fy * k * squash;
  return { x0, y0, x1: x0 + w, y1: mode === "lowered" ? y - seatH : y0 + hh * squash, head: [x, y0], height: h, view,
    art: !!img, frame: sheet ? view : null, mode: sheet ? mode : null };
}
