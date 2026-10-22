// One icon set for the whole client: 24x24 line drawings, 1.6 px strokes with round caps, drawn in
// currentColor (champagne on emerald, emerald on gold). Built with the DOM API like lotus() in
// dom.js, so the page's CSP (no inline markup) holds; the canvas draws the same paths with Path2D
// for the map's label glyphs. Every icon on a button sits beside a text label or an aria-label.

const SVG = "http://www.w3.org/2000/svg";

// name -> path data in a 24x24 box. A path like "M12 8v.01" draws a dot (round caps).
export const ICONS = {
  // the bar and the HUD
  places: ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  talk: ["M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5Z", "M8 11h.01M12 11h.01M16 11h.01"],
  go: ["M4 12h15", "M13 6l6 6-6 6"],
  exit: ["M13 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H13", "M10 12h10", "M16.5 8.5 20 12l-3.5 3.5"],
  stop: ["M8.5 7h7A1.5 1.5 0 0 1 17 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7Z"],
  phone: ["M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3Z", "M11 17.5h2"],
  you: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 20.5a7.5 7.5 0 0 1 15 0"],
  today: ["M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z", "M4 10h16", "M8 3v4M16 3v4", "M8 14h.01M12 14h.01M16 14h.01"],
  log: ["M4 6h10", "M4 11h7", "M4 16h5", "M17 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M17 15.3V17l1.2 1"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  recenter: ["M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5", "M12 12h.01"],
  fit: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  back: ["M15 5l-7 7 7 7"],
  down: ["M6 9l6 6 6-6"],
  up: ["M6 15l6-6 6 6"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5.5", "M12 7.6v.01"],
  search: ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z", "M15.5 15.5 20 20"],
  check: ["M5 12.5 10 17 19 7.5"],
  alert: ["M12 4 21 19.5H3L12 4Z", "M12 10v4.5", "M12 17.3v.01"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  // place kinds (also the map's label glyphs)
  home: ["M4 11 12 4l8 7", "M6 9.5V20h12V9.5", "M10 20v-5h4v5"],
  work: ["M4.5 8h15A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8Z", "M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2", "M3 13h18"],
  cup: ["M5 9h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z", "M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16", "M8.5 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5"],
  basket: ["M4 10h16l-1.6 8.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3L4 10Z", "M8 10l3-6M16 10l-3-6", "M9.5 13.5v3M14.5 13.5v3"],
  bag: ["M5.5 8h13l-1 12h-11l-1-12Z", "M9 8V6.5a3 3 0 0 1 6 0V8"],
  health: ["M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5V4Z"],
  bus: ["M6.5 4h11A1.5 1.5 0 0 1 19 5.5V17H5V5.5A1.5 1.5 0 0 1 6.5 4Z", "M5 11h14", "M7 17v2.5M17 17v2.5", "M8 14h.01M16 14h.01"],
  fun: ["M9 18V6l10-2v12", "M6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M16.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  civic: ["M3.5 9 12 4l8.5 5", "M5 9.5h14", "M6.5 10v7M10 10v7M14 10v7M17.5 10v7", "M4 19.5h16"],
  park: ["M12 21v-6", "M12 15c-4 0-6-2.5-6-5.5S8.5 3 12 3s6 3.5 6 6.5-2 5.5-6 5.5Z"],
  people: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.3a3.5 3.5 0 0 1 0 6.4", "M18 13.6a6.5 6.5 0 0 1 3.5 6.4"],
  // phone apps (phone.js may use these)
  bank: ["M3.5 9 12 4l8.5 5", "M5 9.5h14", "M6.5 10v7M10 10v7M14 10v7M17.5 10v7", "M4 19.5h16"],
  messages: ["M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6Z", "M3.5 7 12 13l8.5-6"],
  map: ["M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z", "M9 4v13.5M15 6.5V20"],
  transit: ["M6.5 4h11A1.5 1.5 0 0 1 19 5.5V17H5V5.5A1.5 1.5 0 0 1 6.5 4Z", "M5 11h14", "M7 17v2.5M17 17v2.5", "M8 14h.01M16 14h.01"],
  career: ["M4.5 8h15A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8Z", "M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2", "M3 13h18"],
  contacts: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.3a3.5 3.5 0 0 1 0 6.4", "M18 13.6a6.5 6.5 0 0 1 3.5 6.4"],
  calendar: ["M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z", "M4 10h16", "M8 3v4M16 3v4"],
  notifications: ["M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z", "M10 20.5a2 2 0 0 0 4 0"],
  wallet: ["M4.5 6.5h14A1.5 1.5 0 0 1 20 8v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7", "M4 7a1.5 1.5 0 0 1 1.5-1.5H16", "M15 12.5h5v3h-5a1.5 1.5 0 0 1 0-3Z"],
  workdesk: ["M8 4.5h8V7H8z", "M7 5.5H5.5A1.5 1.5 0 0 0 4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H17", "M8.5 14l2.5 2.5 4.5-5"],
  jobs: ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z", "M15.5 15.5 20 20", "M8 10.5h5"],
  homes: ["M4 11 12 4l8 7", "M6 9.5V20h12V9.5", "M10 20v-5h4v5"],
  property: ["M8 15a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z", "M11.5 12.5 20 21", "M16 17l2-2M18.5 19.5l1.5-1.5"],
  health_app: ["M3 12h4l2-4 3.5 8 2.5-5 1.5 1H21"],
  items: ["M5.5 8h13l-1 12h-11l-1-12Z", "M9 8V6.5a3 3 0 0 1 6 0V8"],
  store: ["M4 4h7.5L20 12.5 12.5 20 4 11.5V4Z", "M8 8h.01"],
  school: ["M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z", "M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11", "M21.5 9v5"],
  studio: ["M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z", "M6.5 11a5.5 5.5 0 0 0 11 0", "M12 16.5V20M9 20h6"],
  record: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M7.5 8.5a6 6 0 0 1 2-1.8"],
  romance: ["M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"],
  family: ["M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M17 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M2.5 18a4.5 4.5 0 0 1 7-3.7M21.5 18a4.5 4.5 0 0 0-7-3.7", "M8.5 20.5a3.5 3.5 0 0 1 7 0"],
  fame: ["M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8L12 3.5Z"],
  sports: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.3 9.5c3 1 5 3.5 5.7 6.5M20.7 9.5c-3 1-5 3.5-5.7 6.5", "M12 3v4.5"],
  pets: ["M12 20c-3 0-5-1.6-5-3.6 0-2.5 2.6-5.4 5-5.4s5 2.9 5 5.4c0 2-2 3.6-5 3.6Z", "M5.5 11.5a1.8 2.2 0 1 0 0-.1M18.5 11.5a1.8 2.2 0 1 0 0-.1", "M9 7.5a1.8 2.3 0 1 0 0-.1M15 7.5a1.8 2.3 0 1 0 0-.1"],
  weather: ["M8 6V4M3.5 10.5h-1.5M4.7 6.2 3.6 5.1M12.3 6.2l1.1-1.1", "M5.6 12.5a3.5 3.5 0 1 1 6-3.4", "M8 19.5h9a3.5 3.5 0 0 0 0-7h-.3A5 5 0 0 0 7 14a2.8 2.8 0 0 0 1 5.5Z"],
  city: ["M6 21V5", "M3.5 5H20", "M6 5l4 4", "M16 5v5", "M14.5 10h3v3h-3z", "M3 21h7"],
  goals: ["M5 21V4", "M5 4h11l-2 3.5L16 11H5"],
  court: ["M12 4v15.5", "M7.5 19.5h9", "M4.5 7h15", "M6.5 7 3.5 13a3 2.2 0 0 0 6 0L6.5 7Z", "M17.5 7l-3 6a3 2.2 0 0 0 6 0l-3-6Z"],  // the scales (D-083)
  coins: ["M12 9.5c4.1 0 7.5-1.2 7.5-2.75S16.1 4 12 4 4.5 5.2 4.5 6.75 7.9 9.5 12 9.5Z", "M4.5 6.75v5c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75v-5", "M4.5 11.75v5C4.5 18.3 7.9 19.5 12 19.5s7.5-1.25 7.5-2.75v-5"],
  // social media (social.js, D-074)
  social: ["M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5Z",
    "M12 14.2s-3.2-1.9-3.2-4.2A1.7 1.7 0 0 1 12 9.1a1.7 1.7 0 0 1 3.2.9c0 2.3-3.2 4.2-3.2 4.2Z"],
  heart: ["M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"],
  comment: ["M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5A1.5 1.5 0 0 1 19 17h-8l-4 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"],
  mask: ["M3 8.5c3-1.3 6-1.1 9 .7 3-1.8 6-2 9-.7 0 5-2.6 8-5.6 8-1.6 0-2.6-1-3.4-2.2-.8 1.2-1.8 2.2-3.4 2.2-3 0-5.6-3-5.6-8Z",
    "M7 11.5c.8-.6 1.9-.6 2.7 0M14.3 11.5c.8-.6 1.9-.6 2.7 0"],
  pin: ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M9 21h6"],
  send: ["M4 12 20 4l-4.5 16-4-6.5L4 12Z", "M11.5 13.5 20 4"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  // things to do in a room (ui.js's tray)
  shower: ["M6 21V8.5a4.5 4.5 0 0 1 9 0", "M11.5 9h7", "M13 13v.01M16 13v.01M19 13v.01M14.5 16.5v.01M17.5 16.5v.01M16 20v.01"],
  bed: ["M3 19V7", "M3 14h18v5", "M7 14v-2.5A1.5 1.5 0 0 1 8.5 10h3a1.5 1.5 0 0 1 1.5 1.5V14"],
  toilet: ["M7 3.5h6v6.5H7z", "M4.5 10h12a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6Z", "M8.5 16v4.5h5V16"],
  cook: ["M4 10.5h16", "M5.5 10.5v6a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-6", "M2.5 10.5H4M20 10.5h1.5", "M9.5 4c0 1.4 1 1.9 1 3.3M13.5 4c0 1.4 1 1.9 1 3.3"],
  tv: ["M4.5 6.5h15A1.5 1.5 0 0 1 21 8v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V8a1.5 1.5 0 0 1 1.5-1.5Z", "M9 21h6", "M9 3l3 3 3-3"],
  teeth: ["M4 20 13.5 10.5", "M13.5 10.5l1.5-1.5", "M15 4.5h5v4.5h-5z", "M16.5 4.5v4.5M18.5 4.5v4.5"],
  mirror: ["M12 15a4.5 5.5 0 1 0 0-11 4.5 5.5 0 0 0 0 11Z", "M12 15v5.5", "M8.5 20.5h7"],
  broom: ["M15 3 10.5 12.5", "M6.5 12.5h7.5l-1 8H5.5l1-8Z", "M8 15.5v3M10.5 15.5v3"],
  trash: ["M5 7h14", "M9.5 7V4.5h5V7", "M6.5 7l1 13h9l1-13", "M10 11v5.5M14 11v5.5"],
};

// <svg class="icon"> with the icon's paths; decorative unless a label is given.
export function icon(name, label) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon icon-${name}`);
  svg.setAttribute("focusable", "false");
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name] || ICONS.info) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

// The same drawing on a canvas: centred on (x, y), `size` px across, stroked in `color`.
const pathCache = new Map();
export function drawIcon(ctx, name, x, y, size, color, width = 1.8) {
  if (typeof Path2D === "undefined") return;
  let paths = pathCache.get(name);
  if (!paths) { paths = (ICONS[name] || []).map(d => new Path2D(d)); pathCache.set(name, paths); }
  if (!paths.length) return;
  const k = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2); ctx.scale(k, k);
  ctx.strokeStyle = color; ctx.lineWidth = width / k; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const p of paths) ctx.stroke(p);
  ctx.restore();
}

// Which glyph a place type gets on its map label and in the Places list.
const KIND = {
  coffee_shop: "cup", bar: "cup", restaurant: "cup", nightclub: "fun",
  grocery: "basket", boutique: "bag", clothing_store: "bag", electronics_store: "bag", jeweler: "bag", salon: "bag", laundromat: "bag",
  clinic: "health", hospital: "health", pharmacy: "health", wellness_studio: "health", vet: "health", gym: "health",
  apartment: "home", apartments: "home", apartment_building: "home", condo: "home", house: "home", townhouse: "home", lofts: "home", tower: "home",
  office: "work", tech_office: "work", law_firm: "work", newsroom: "work", event_agency: "work", creative_agency: "work", construction_office: "work",
  recording_studio: "fun", cinema: "fun", sports_field: "sports", sports_court: "sports", clubhouse: "sports",
  church: "civic", civic: "civic", courthouse: "court", community_center: "civic", university: "school", school: "school", daycare: "school", animal_shelter: "pets",
  park: "park", street_corner: "civic", construction_site: "city",
};
export const kindIcon = type => KIND[type] || "places";
