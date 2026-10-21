// DOM helpers. Every string from the server (names, speech, messages, error messages) is
// player- or data-supplied, so it only ever reaches the page as a text node or an attribute
// value set through the DOM API. Nothing here builds HTML from strings.

// el("button", {class: "btn", onclick: fn, "aria-label": "Close"}, "Close", childNode, [more])
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "value") node.value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected" || k === "required") node[k] = !!v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}

// The LIVÉRA lotus, as on the transit card: five gold petals, strokes only. Built with the DOM
// API like everything else (no markup strings).
const SVG = "http://www.w3.org/2000/svg";
const LOTUS_PETALS = [
  "M32 5C25.5 13 24.5 26 32 39C39.5 26 38.5 13 32 5Z",                 // centre
  "M32 39C22.5 34.5 16 25.5 16.5 13.5C24.5 17 30 26 32 39Z",            // inner left
  "M32 39C41.5 34.5 48 25.5 47.5 13.5C39.5 17 34 26 32 39Z",            // inner right
  "M32 39C21 40.5 9.5 35 3 25.5C13.5 23.5 25 29.5 32 39Z",              // outer left
  "M32 39C43 40.5 54.5 35 61 25.5C50.5 23.5 39 29.5 32 39Z",            // outer right
  "M21 44.5C28 46.5 36 46.5 43 44.5",                                    // the water line under it
];
export function lotus(label) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 64 48");
  svg.setAttribute("class", "lotus");
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of LOTUS_PETALS) { const p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); svg.appendChild(p); }
  return svg;
}
// The wordmark on the full-screen screens: the lotus over "LIVÉRA", letterspaced (CSS capitals).
export const wordmark = () => el("div", { class: "wordmark" }, lotus(), el("span", { class: "wordmark-text" }, "Livéra"));

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function replace(node, ...children) { clear(node); append(node, children); return node; }

export const money = c => {
  const n = Number(c) || 0, sign = n < 0 ? "−" : "";
  return sign + "$" + (Math.abs(n) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
export const titleCase = s => String(s || "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
export const firstName = name => String(name || "").split(" ")[0];
// Notifications end with a hint for the terminal client ("(answer with request id ask-27)"); here
// asks are answered with buttons, so the hint is dropped.
export const withoutCliHint = text => String(text ?? "").replace(/\s*\(answer with request id [^)]*\)\s*$/, "");
export const initials = name => String(name || "?").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();

// Faces: client/faces/<character id>.jpg for the founding cast. The manifest says which exist,
// so the page never requests an image that isn't there (and logs no 404s).
const faceIds = new Set();
export async function loadFaceManifest() {
  try {
    const r = await fetch("faces/manifest.json", { cache: "no-cache" });
    if (r.ok) for (const id of await r.json()) if (typeof id === "string") faceIds.add(id);
  } catch { /* no faces: everyone shows initials */ }
}
export const hasFace = id => faceIds.has(id);
// Ids come from the server; only ids listed in our own manifest ever become a URL.
export const faceUrl = id => (faceIds.has(id) ? `faces/${encodeURIComponent(id)}.jpg` : null);

// Building sprites: client/sprites/<place id>.webp, map-size copies of the owner's pictures in
// art/places. Same rule as faces: only ids in the manifest are ever requested.
const spriteIds = new Set();
export async function loadSpriteManifest() {
  try {
    const r = await fetch("sprites/manifest.json", { cache: "no-cache" });
    if (r.ok) for (const id of await r.json()) if (typeof id === "string") spriteIds.add(id);
  } catch { /* no sprites: every building is drawn as a box */ }
}
export const spriteUrl = id => (spriteIds.has(id) ? `sprites/${encodeURIComponent(id)}.webp` : null);

// Ground tiles and set pieces: client/tiles/<id>.webp, made by scripts/client_tiles.py from the
// owner's art/tiles and bus-shelter pictures. Its manifest.json gives each one's kind ("texture":
// a top-down square laid flat on the map; "sprite": a picture stood up on it), size and anchor
// points (fractions of the picture). Same rule as the sprites: only ids in the manifest are ever
// requested; with no manifest the map keeps its hand-drawn ground, crane, bridge and stop posts.
const tiles = new Map();
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
export async function loadTileManifest() {
  try {
    const r = await fetch("tiles/manifest.json", { cache: "no-cache" });
    if (!r.ok) return;
    const m = await r.json();
    for (const [id, t] of Object.entries(m && typeof m === "object" ? m : {})) {
      if (!/^[a-z0-9_]+$/.test(id) || !t || (t.kind !== "texture" && t.kind !== "sprite")) continue;
      if (!isPoint(t.size) || !(t.size[0] > 0 && t.size[1] > 0)) continue;
      const anchors = {};
      for (const [k, p] of Object.entries(t.anchors && typeof t.anchors === "object" ? t.anchors : {})) if (isPoint(p)) anchors[k] = p;
      const lamps = Array.isArray(t.lamps) ? t.lamps.filter(isPoint) : [];
      tiles.set(id, Object.freeze({ kind: t.kind, size: t.size, anchors: Object.freeze(anchors), lamps: Object.freeze(lamps) }));
    }
  } catch { /* no tiles: the hand-drawn ground */ }
}
export const tileInfo = id => tiles.get(id) || null;
export const tileUrl = id => (tiles.has(id) ? `tiles/${encodeURIComponent(id)}.webp` : null);

// The pick list in groups (D-073), from each card's `cast` in the `characters` reply: the founders, the residents,
// the townspeople, then characters made in this town. A cast the client doesn't know yet still shows, last.
const CAST_GROUPS = [["founder", "The founders"], ["resident", "Residents"], ["townsperson", "Townspeople"], ["created", "Made in this town"]];
export function castGroups(list, card) {
  const kind = c => (c.created ? "created" : typeof c.cast === "string" && c.cast ? c.cast : "founder");
  const known = new Set(CAST_GROUPS.map(([k]) => k)), out = [];
  for (const [k, label] of [...CAST_GROUPS, ["", "Others"]]) {
    const members = list.filter(c => (k ? kind(c) === k : !known.has(kind(c))));
    if (!members.length) continue;
    out.push(el("h2", { class: "cast-head eyebrow", dataset: { cast: k || "other" } }, `${label} · ${members.length}`));
    for (const c of members) out.push(card(c));
  }
  return out;
}

export function avatar(id, name, size = "") {
  const url = faceUrl(id);
  if (url) return el("img", { class: `av ${size}`, src: url, alt: "", "aria-hidden": "true", draggable: "false" });
  return el("span", { class: `av mono ${size}`, "aria-hidden": "true" }, initials(name || id));
}

// localStorage can be missing or throw (private windows, blocked storage); the game works without it.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
