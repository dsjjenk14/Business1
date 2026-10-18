// The town's look: a LABELLED SKETCH, forked from the town preview (days20_shell.html).
//
// Only the door coordinates, names, types, districts, statuses and bus stops come from the
// server (`map`). Everything in this file is drawn by hand for the 2.5D preview and is NOT game
// data: building sizes by type, street lines, the river, the parks, trees and colours. The
// page says so on screen ("street layout and building shapes are sketches"). When the town
// layout moves into data/world (web_client.md, Phase 1), this file shrinks to colours.

export const SKETCH_NOTICE = "2.5D preview: street layout and building shapes are sketches";

// Building shapes by location type: [width, depth, height] in meters, and a palette key.
export const SHAPES = {
  tower: [32, 32, 96, "home"], apartments: [40, 26, 28, "home"], lofts: [36, 24, 30, "home"], townhouse: [14, 16, 15, "home"],
  apartment_building: [40, 26, 28, "home"], coffee_shop: [20, 16, 9, "shop"], grocery: [30, 22, 9, "shop"], boutique: [16, 14, 11, "shop"],
  recording_studio: [22, 18, 10, "shop"], nightclub: [30, 24, 12, "shop"], gym: [26, 20, 10, "shop"], wellness_studio: [20, 18, 12, "shop"],
  office: [24, 24, 40, "work"], tech_office: [24, 24, 22, "work"], newsroom: [18, 16, 12, "work"], event_agency: [18, 16, 12, "work"],
  creative_agency: [20, 18, 18, "work"], construction_office: [16, 8, 6, "site"], clinic: [26, 20, 14, "civic"], church: [18, 28, 14, "civic"],
  civic: [22, 18, 10, "civic"], community_center: [28, 20, 10, "civic"],
  clothing_store: [24, 18, 10, "shop"], electronics_store: [24, 18, 9, "shop"], pharmacy: [22, 16, 8, "shop"], jeweler: [14, 12, 8, "shop"],
  salon: [16, 14, 8, "shop"], bar: [22, 18, 9, "shop"], university: [44, 36, 22, "civic"], hospital: [44, 30, 30, "civic"],
  law_firm: [22, 20, 26, "work"], street_corner: [30, 10, 7, "site"],
  house: [14, 16, 8, "home"], condo: [34, 24, 22, "home"], restaurant: [22, 16, 9, "shop"], cinema: [30, 22, 12, "shop"],
  clubhouse: [20, 14, 8, "civic"], animal_shelter: [22, 16, 8, "civic"], vet: [20, 16, 9, "civic"], laundromat: [16, 12, 7, "shop"],
  school: [44, 26, 12, "civic"], daycare: [22, 16, 7, "civic"],
  sports_field: [60, 36, 0, "field"], sports_court: [30, 18, 0, "court"],
};
export const PAL = {
  home: ["#c9a46a", "#9c7c4c", "#7d613a"], shop: ["#b8735a", "#8f5544", "#6f4033"], work: ["#8b9aa8", "#677585", "#4f5b68"],
  civic: ["#d7d2c6", "#aea89b", "#8d8779"], site: ["#9b7a4b", "#7a5f3a", "#5d482c"],
  field: ["#4f8f4a", "#4f8f4a", "#4f8f4a"], court: ["#c27a4a", "#c27a4a", "#c27a4a"],
};
// A few landmarks drawn bigger or in their own colours (by location id; sketch only).
export const SPECIAL = { whitaker_capital: [28, 28, 58], meridian_talent: [24, 24, 42] };
export const SPECIAL_COLORS = { lexington: ["#a9b6c2", "#7c8b99", "#5d6a77"], fire_station: ["#c0574a", "#97433a", "#73322c"] };

// Apartment and condo units that share a door are drawn as one building. The building's
// shape is a sketch choice per id prefix; its name is the units' shared name ("Maple Court").
export const GROUP_SHAPE = { lexington: "tower", maple_court: "apartments", riverside_lofts: "lofts", lakeview: "condo" };
const UNIT_TYPES = new Set(["apartment", "condo"]);

export function footprint(b) {
  const s = SPECIAL[b.id] || SHAPES[b.shape] || [18, 16, 10];
  const [w, d, h] = s, [x, y] = b.door;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - d, y1: y, h, pal: (SHAPES[b.shape] || [0, 0, 0, "shop"])[3] };
}

// Buildings to draw from the server's place list: units grouped by door, construction sites
// folded into the building going up on them, parks drawn as ground (not boxes).
export function buildingsFrom(places) {
  const out = [], byDoor = new Map();
  const doorKey = p => `${p.door[0]},${p.door[1]}`;
  for (const p of places) {
    if (UNIT_TYPES.has(p.type)) {
      const k = doorKey(p);
      let b = byDoor.get(k);
      if (!b) {
        const prefix = Object.keys(GROUP_SHAPE).find(g => p.id.startsWith(g));
        b = { id: prefix || p.id, name: String(p.name).split(", ")[0], type: p.type, shape: prefix ? GROUP_SHAPE[prefix] : "apartments",
              district: p.district, door: p.door, status: "open", units: [], enterable: true };
        byDoor.set(k, b); out.push(b);
      }
      b.units.push(p);
      continue;
    }
    if (p.type === "construction_site" || p.type === "park") continue;
    out.push({ id: p.id, name: p.name, type: p.type, shape: p.type, district: p.district, door: p.door, status: p.status,
               enterable: p.enterable, units: null, place: p });
  }
  return out;
}

export const ROADS = [
  { name: "Founders Way", pts: [[150, 565], [840, 565]], project: "founders_way" },
  { name: "Main Street", pts: [[452, 240], [452, 565]] },
  { name: "Lexington Avenue", pts: [[230, 485], [805, 485]] },
  { name: "River Road", pts: [[805, 250], [805, 712]] },
  { name: "Church Street", pts: [[235, 380], [235, 565]] },
  { name: "Civic Row", pts: [[620, 312], [805, 312]] },
  { name: "Willow Lane", pts: [[150, 712], [470, 712]] },
  { name: "Lakeshore Drive", pts: [[240, 565], [240, 712]] },
  { name: "Riverside Drive", pts: [[560, 668], [805, 668]] },
];

// Parks are real places (Founders Park, Willow Lake Park); their outlines here are sketches
// centred on the park's door from the server.
export const PARK_SHAPES = {
  founders_park: { rx: 42, ry: 40 },
  willow_lake_park: { rx: 44, ry: 36, lake: { rx: 24, ry: 18 }, boardwalk: [[-24, 10], [10, 10]] },
};
export const RIVER = { x0: 860, x1: 1000 };

export const TREES = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 8 + rnd() * 30; TREES.push([400 + Math.cos(a) * r, 350 + Math.sin(a) * r * 0.9, 5 + rnd() * 4]); }
  for (let i = 0; i < 14; i++) TREES.push([840 + rnd() * 10, 260 + i * 28, 6]);
  for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, r = 30 + rnd() * 12; TREES.push([290 + Math.cos(a) * r, 690 + Math.sin(a) * r * 0.8, 5 + rnd() * 3]); }
}

// Plain-language type names for place cards.
export const TYPE_NAMES = {
  tower: "Luxury apartments", apartments: "Apartments", lofts: "Lofts", townhouse: "Townhouse", apartment: "Apartment", condo: "Condos",
  coffee_shop: "Café", grocery: "Grocery", boutique: "Boutique", recording_studio: "Recording studio", nightclub: "Nightclub",
  gym: "Gym", wellness_studio: "Therapy & wellness", office: "Office", tech_office: "Tech startup", newsroom: "Newsroom",
  event_agency: "Event agency", creative_agency: "Creative agency", construction_office: "Site office", clinic: "Clinic",
  church: "Church", civic: "Civic building", community_center: "Community center", park: "Park", apartment_building: "Apartments",
  clothing_store: "Clothing", electronics_store: "Electronics", pharmacy: "Pharmacy", jeweler: "Jeweler", salon: "Salon", bar: "Bar",
  university: "University", hospital: "Hospital", law_firm: "Law firm", street_corner: "Street corner", house: "House",
  restaurant: "Restaurant", cinema: "Cinema", sports_field: "Soccer field", sports_court: "Basketball court", clubhouse: "Clubhouse",
  animal_shelter: "Pet adoption", vet: "Vet", laundromat: "Laundromat", school: "School", daycare: "Daycare",
};
export const typeName = t => TYPE_NAMES[t] || String(t || "").replace(/_/g, " ");
