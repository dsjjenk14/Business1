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
