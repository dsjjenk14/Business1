// The Places sheet (spec R1.5): find a place by name or kind, see whether it's open and how far it
// is, and go there or show it on the map. Everything comes from the server's `map` (names, types,
// districts, doors, statuses and, on servers that send them, opening hours); "Your home" and "Your
// workplace" come from your own Property and Career apps. Go walks you to the door and in (the
// server decides at the door); places you can't go into are offered Show only.

import { el, replace } from "./dom.js";
import { typeName } from "./layout.js";
import { icon, kindIcon } from "./icons.js";
import { dist } from "./state.js";
import { openingText } from "./messages.js";

export const CATEGORIES = [
  ["all", "All"],
  ["food", "Food & drink", ["coffee_shop", "restaurant", "bar", "grocery"]],
  ["shops", "Shops", ["grocery", "boutique", "clothing_store", "electronics_store", "jeweler", "salon", "laundromat", "pharmacy"]],
  ["work", "Work", ["office", "tech_office", "law_firm", "newsroom", "event_agency", "creative_agency", "construction_office", "recording_studio"]],
  ["health", "Health", ["clinic", "hospital", "pharmacy", "wellness_studio", "gym", "vet"]],
  ["homes", "Homes", ["apartment", "apartments", "apartment_building", "condo", "house", "townhouse", "lofts", "tower"]],
  ["fun", "Fun", ["nightclub", "cinema", "bar", "recording_studio", "sports_field", "sports_court", "clubhouse", "park", "gym", "restaurant"]],
  ["civic", "Civic", ["church", "civic", "community_center", "university", "school", "daycare", "animal_shelter", "street_corner"]],
  ["stops", "Bus stops"],
];
const EVERYDAY = new Set(["coffee_shop", "grocery", "pharmacy", "clinic", "restaurant"]);
export const isEveryday = type => EVERYDAY.has(type);

// Every place a player can look for: buildings (units grouped), open spaces, bus stops.
export function placeRows(game) {
  const w = game.world, a = game.agenda, home = a.homeId(), work = new Set(a.workplaces().map(p => p.id));
  const homeBuilding = home ? w.buildingOfPlace.get(home) : null;
  const rows = [];
  for (const b of w.buildings) {
    const type = b.shape || b.type, mineHome = homeBuilding && homeBuilding.id === b.id, mineWork = work.has(b.id) || (b.units || []).some(u => work.has(u.id));
    const place = w.placeById.get(b.id) || null;
    const enter = mineHome ? home : (b.units ? null : (b.enterable !== false && b.status !== "under_construction" ? b.id : null));
    rows.push({ id: b.id, name: b.name, type, rawType: b.type, district: b.district, door: b.door, status: b.status, place, enter: enter || (mineWork ? b.id : null),
      home: !!mineHome, work: !!mineWork, placeholder: b.type === "civic" && b.enterable === false });
  }
  for (const p of w.places.filter(p => p.type === "park")) rows.push({ id: p.id, name: p.name, type: "park", rawType: "park", district: p.district, door: p.door, status: p.status, place: p, walk: true });
  for (const s of w.allStops()) rows.push({ id: s.id, name: s.name, type: "stop", rawType: "stop", district: (w.lineOfStop(s.id) || {}).name || "Bus", door: s.at, stop: true });
  return rows;
}

export function sheetPlaces(ui, opts = {}) {
  const game = ui.game, w = game.world;
  let cat = opts.category || "all", query = "";
  const list = el("ul", { class: "list places-list", id: "places-list", "aria-live": "off" });
  const count = el("p", { class: "hint", role: "status" });
  const search = el("input", { type: "search", class: "input", id: "places-search", placeholder: "Search places", "aria-label": "Search places", autocomplete: "off", enterkeyhint: "search" });
  const chips = el("div", { class: "cats", role: "group", "aria-label": "Kinds of place" }, CATEGORIES.map(([k, label]) =>
    el("button", { type: "button", class: "cat", "aria-pressed": String(k === cat), dataset: { cat: k }, onclick: () => { cat = k; for (const b of chips.children) b.setAttribute("aria-pressed", String(b.dataset.cat === k)); render(); } }, label)));
  let distNodes = [];
  const render = () => {
    const me = w.selfPos(), m = w.minute(), q = query.trim().toLowerCase();
    const def = CATEGORIES.find(c => c[0] === cat);
    let rows = placeRows(game).filter(r => {
      if (cat === "stops") { if (!r.stop) return false; } else if (cat !== "all" && !(def[2] || []).includes(r.type) && !(def[2] || []).includes(r.rawType)) return false;
      if (!q) return true;
      return [r.name, typeName(r.type), r.district].some(s => String(s || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => (b.home - a.home) || (b.work - a.work) || dist(me, a.door) - dist(me, b.door));
    distNodes = [];
    count.textContent = `${rows.length} ${rows.length === 1 ? "place" : "places"}${q ? ` matching “${query.trim()}”` : ""}`;
    replace(list, rows.slice(0, 80).map(r => {
      const o = r.place ? openingText(r.place, m) : null;
      const closed = r.status === "closed" || (o && !o.open), building = r.status === "under_construction";
      const home = ["apartment", "apartments", "apartment_building", "condo", "house", "townhouse", "lofts", "tower"].includes(r.type);
      const status = building ? "Under construction" : o ? o.text : closed ? "Closed now" : r.stop || home ? "" : r.place && r.place.enterable === false && !r.walk ? "" : "Open now";
      const d = el("span", { class: "dist" });
      distNodes.push([d, r]);
      const tags = [r.home ? "Your home" : null, r.work ? "Your workplace" : null].filter(Boolean);
      const show = () => (r.stop ? game.showStop(r.id) : game.showPlace(r.home ? game.agenda.homeId() : r.id));
      const go = r.stop || r.walk ? () => { ui.closeSheet(); game.walkTo(r.door); } : r.enter ? () => game.goInside(r.enter) : null;
      return el("li", { class: `place-row${closed ? " closed" : ""}`, dataset: { place: r.id } },
        el("button", { type: "button", class: "place-show", "aria-label": `${r.name}${tags.length ? `, ${tags.join(", ")}` : ""}: show it on the map`, onclick: show },
          el("span", { class: "kind", "aria-hidden": "true" }, icon(r.stop ? "bus" : kindIcon(r.type))),
          el("span", { class: "grow" },
            el("span", { class: "place-name" }, r.name, tags.map(t => el("span", { class: "badge mine" }, t))),
            el("span", { class: "hint" }, [r.stop ? `Bus stop · ${r.district}` : typeName(r.type), !r.stop && r.district ? r.district : null].filter(Boolean).join(" · ")),
            el("span", { class: "hint" }, status ? el("span", { class: closed || building ? "st-closed" : "st-open" }, status) : null, status ? " · " : null, d))),
        go ? el("button", { type: "button", class: "btn small primary place-go", "aria-label": `${r.stop || r.walk ? "Walk to" : "Go to"} ${r.name}`, onclick: go }, "Go") : null);
    }));
    update();
  };
  const update = () => {
    const me = w.selfPos();
    for (const [n, r] of distNodes) {
      const d = me ? dist(me, r.door) : null;
      n.textContent = d === null ? "" : w.self && w.self.inside && (r.enter === w.self.inside || r.id === w.self.inside) ? "you're here" : `${Math.round(d)} m · about ${Math.max(5, Math.round(d / (w.rules.walk_speed_mps || 6) / 5) * 5)} s`;
    }
  };
  let timer = null;
  search.addEventListener("input", () => { query = search.value; clearTimeout(timer); timer = setTimeout(render, 120); });
  search.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); search.blur(); } });
  const body = [search, chips, count, list, el("p", { class: "source" }, "From the town map. Opening hours and statuses are the server's; distances are from where you stand.")];
  let lastUpdate = 0;
  ui.openSheet("places", "places", ui.head("Find a place", "Places"), body, now => { if (now - lastUpdate > 1000) { lastUpdate = now; update(); } }, { height: "full" });
  render();
  if (!ui.narrow()) setTimeout(() => search.focus(), 30);
}
