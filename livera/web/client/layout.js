// The town's look: a LABELLED SKETCH, forked from the town preview (days20_shell.html).
//
// Only the door coordinates, names, types, districts, statuses and bus stops come from the
// server (`map`). Everything in this file is drawn by hand for the 2.5D preview and is NOT game
// data: building sizes by type, street lines, the river and its bridge, the parks, trees, the
// light through the day and colours. The
// page says so on screen ("street layout and building shapes are sketches"). When the town
// layout moves into data/world (web_client.md, Phase 1), this file shrinks to colours.

export const SKETCH_NOTICE = "2.5D preview: street layout and building shapes are sketches";

// Building shapes by location type: [width, depth, height] in meters, and a palette key.
export const SHAPES = {
  tower: [32, 32, 96, "glass"], apartments: [40, 26, 28, "home"], lofts: [36, 24, 30, "home"], townhouse: [14, 16, 15, "brick"],
  apartment_building: [40, 26, 28, "home"], coffee_shop: [20, 16, 9, "shop"], grocery: [30, 22, 9, "shop"], boutique: [16, 14, 11, "shop"],
  recording_studio: [22, 18, 10, "shop"], nightclub: [30, 24, 12, "shop"], gym: [26, 20, 10, "shop"], wellness_studio: [20, 18, 12, "shop"],
  office: [24, 24, 40, "glass"], tech_office: [24, 24, 22, "glass"], newsroom: [18, 16, 12, "work"], event_agency: [18, 16, 12, "work"],
  creative_agency: [20, 18, 18, "work"], construction_office: [16, 8, 6, "site"], clinic: [26, 20, 14, "civic"], church: [18, 28, 14, "brick"],
  civic: [22, 18, 10, "civic"], community_center: [28, 20, 10, "civic"],
  clothing_store: [24, 18, 10, "shop"], electronics_store: [24, 18, 9, "shop"], pharmacy: [22, 16, 8, "shop"], jeweler: [14, 12, 8, "shop"],
  salon: [16, 14, 8, "shop"], bar: [22, 18, 9, "brick"], university: [44, 36, 22, "civic"], hospital: [44, 30, 30, "civic"],
  law_firm: [22, 20, 26, "glass"], street_corner: [30, 10, 7, "site"],
  house: [14, 16, 8, "home"], condo: [34, 24, 22, "home"], restaurant: [22, 16, 9, "shop"], cinema: [30, 22, 12, "shop"],
  clubhouse: [20, 14, 8, "civic"], animal_shelter: [22, 16, 8, "civic"], vet: [20, 16, 9, "civic"], laundromat: [16, 12, 7, "shop"],
  school: [44, 26, 12, "brick"], daycare: [22, 16, 7, "civic"],
  sports_field: [60, 36, 0, "field"], sports_court: [30, 18, 0, "court"],
};
// The look follows the owner's reference art (the Line 1 route poster, the transit card): ivory and
// sand stone, warm brick, charcoal glass with gold edges, champagne gold trim, sage lawns.
// Each palette is [roof, east face, south face] in full daylight; the renderer tints it by the hour.
export const PAL = {
  home: ["#fbf4e6", "#eadac0", "#d6c2a0"],      // ivory stone
  shop: ["#f6e7cc", "#e3cba5", "#ccb189"],      // sand stone
  work: ["#f1e6d1", "#dccbaa", "#c5ae88"],      // pale limestone (studios, agencies)
  civic: ["#fdf8ef", "#ece2cf", "#d4c5a9"],     // white limestone
  brick: ["#d6a07b", "#ad734e", "#884f2d"],     // warm brick
  glass: ["#56625e", "#323d3b", "#252e2d"],     // charcoal glass, gold-edged (towers and offices)
  site: ["#dcc6a0", "#c7ab80", "#a98e65"],
  field: ["#aab48e", "#aab48e", "#aab48e"], court: ["#c98d66", "#c98d66", "#c98d66"],
};
// A few landmarks drawn bigger or in their own colours (by location id; sketch only).
export const SPECIAL = { whitaker_capital: [28, 28, 58], meridian_talent: [24, 24, 42] };
export const SPECIAL_COLORS = { fire_station: ["#d98b72", "#b9614e", "#8f4535"] };
// Palettes drawn with gold edges up every corner, not only along the roof.
export const GOLD_EDGED = new Set(["glass"]);

// Surfaces and accents in daylight (the renderer tints them by the hour, as the buildings).
export const LOOK = {
  gold: "#dabb85", goldLight: "#e8cf9c", goldDeep: "#b48a4c", emerald: "#0b2b23", emeraldDeep: "#051d17", emeraldMid: "#2e4636", ivory: "#f7ecd6",
  ground: ["#f5e8cf", "#e6d0aa"],               // parchment: centre, edges
  slab: ["#d9c29c", "#c3a77d"],                 // the map's cut edges (south, east)
  lawn: ["#bcc09c", "#a6ad88"],                 // sage lawn: centre, rim
  water: ["#93c0c3", "#6e9fa9"],                // soft blue-teal: near, far
  waterGold: ["#9fa7bf", "#dcb3ad"],            // at golden hour it mirrors the sky: lavender-blue near, rose far
  stone: ["#f2e6cf", "#dccaa8", "#c2aa83"],     // cream stone: top, face, shadow
  road: "#8b857c", kerb: "#e6d6b9", dash: "#f7ecd6", gravel: "#cdb489",
  tree: ["#6f7656", "#879072", "#a9ad8c"],      // olive shade, sage, sunlit
  trunk: "#7a4d2e", roof: "#9a5f3d",            // house roofs: warm wood brown
  glassDay: "#8fb1b5", glassGold: "#f3c993", glassNight: "#173030", lit: "#ffcf86",
};

// The light over the town by the hour: sky top, sky middle, horizon, the ambient colour every
// surface is tinted toward and how strongly, and how golden the hour is (0..1). Day is warm
// champagne; dawn and dusk are golden hour (peach horizon rising to rose and lavender); night is
// deep emerald-navy. The renderer interpolates between the keys.
export const LIGHT = [
  [0, "#03111a", "#061c1d", "#0a2a24", "#061a22", 0.84, 0],
  [4.7, "#03111a", "#061c1d", "#0a2a24", "#061a22", 0.84, 0],
  [5.5, "#3a3a58", "#8c6f86", "#d99f86", "#5e4a66", 0.48, 0.55],
  [6.3, "#d2b6b1", "#e2bda0", "#fce5ba", "#ffc070", 0.14, 1],
  [7.6, "#e7d5ba", "#f0e0c4", "#f9eed8", "#fff0d4", 0.07, 0.12],
  [16.9, "#e7d5ba", "#f0e0c4", "#f9eed8", "#fff0d4", 0.07, 0.12],
  [18.5, "#d2b6b1", "#e2bda0", "#f7d3ac", "#ffc070", 0.15, 1],
  [19.5, "#5e4d6a", "#a77a88", "#d79d83", "#76587a", 0.44, 0.6],
  [20.3, "#03111a", "#061c1d", "#0a2a24", "#061a22", 0.84, 0],
  [24, "#03111a", "#061c1d", "#0a2a24", "#061a22", 0.84, 0],
];

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
// folded into the building going up on them, parks drawn as ground (not boxes). A site and the
// building going up on it share a door in the map's data; `site` keeps the site's place id, so
// the site's own picture can stand in for the building while it's under construction.
export function buildingsFrom(places) {
  const out = [], byDoor = new Map();
  const doorKey = p => `${p.door[0]},${p.door[1]}`;
  const sites = new Map(places.filter(p => p.type === "construction_site").map(p => [doorKey(p), p.id]));
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
               enterable: p.enterable, units: null, place: p, site: sites.get(doorKey(p)) || null });
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
// The river along the east edge: water sunk below a cream stone embankment on the west bank.
export const RIVER = { x0: 860, x1: 1000, depth: 10, promenade: 10 };
// An arched stone bridge on the line of Lexington Avenue, from River Road to the map edge
// (sketch decoration, like the river: no place, no stop, nothing to tap).
export const BRIDGE = { y: 485, x0: 805, x1: 1000, width: 14, arches: 4, pier: 7, rise: 7.6 };

// The owner's ground tiles and set pieces (client/tiles/, made by scripts/client_tiles.py), as the
// sketch lays them out. How many meters one repeat of each ground texture covers (the gravel spans
// a road's width instead):
export const TILE_METERS = { grass: 16, paving: 7, asphalt: 9 };
// The bridge picture spans the river on Lexington Avenue's line, its deck from the quay (x0) to just
// short of the map's east edge (x1, where its stair comes down), at height z; a paved approach joins
// it to River Road. Like the drawn bridge it is decoration: nobody can cross it.
export const BRIDGE_ART = { x0: 852, x1: 985, z: 1, approach: 805 };
export const CRANE_M = 38;          // the crane marker's height to its jib, the same over every site
export const SHELTER_M = 13;        // a bus shelter picture's width on the map
export const SITE_FRAMED_PCT = 35;  // a site shows its framed stage once its project is this far along
// Site pictures that already paint tower cranes of their own: no crane marker on top of them.
export const SITE_ART_CRANES = new Set(["maple_court_ii_site", "eclat_site_framed", "body_balance_site_framed"]);
// Parks drawn with the owner's picture (client/sprites/<park>.webp) standing on their lawn: the
// square lot it stands on. Willow Lane crosses the sketch's oval for Willow Lake Park, so the
// picture takes the square between Lakeshore Drive and Willow Lane; the sketch's lake, boardwalk
// and trees inside it give way to the picture's.
export const PARK_ART = { willow_lake_park: { x0: 266, x1: 318, y0: 646, y1: 698 },
                          founders_park: { x0: 360, x1: 440, y0: 310, y1: 390 } };
// Road works: while a road's project is active, the picture of its works is laid along the road
// from x `from` to `to`, next to the site's door but clear of the junction there: the bare site
// (client/sprites/<site>.webp, the site being the construction-site place whose door is on the
// road) until the project is SITE_FRAMED_PCT along, then the framed stage (<site>_framed.webp).
// Measured on each picture: its road's centre line at the near end (`near`, the paved end of the
// framed stage) and further along (`far`), as fractions of it; it is mirrored, its road running
// along the art's y axis. The framed stage is stretched to fit. The bare site is drawn from a
// flatter angle than the map's, so it would come out nearly twice as tall: it keeps its proportions
// times `stretch` and is sheared (its verticals stay upright) to lay its road along the map's.
export const ROAD_WORKS = {
  founders_way: { from: 401, to: 445,
                  framed: { near: [0.1484, 0.8052], far: [0.9375, 0.284] },
                  bare: { near: [0.151, 0.7292], far: [0.9094, 0.2497], stretch: 1.2 } },
};

export const TREES = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 8 + rnd() * 30; TREES.push([400 + Math.cos(a) * r, 350 + Math.sin(a) * r * 0.9, 5 + rnd() * 4]); }
  // The river-bank rows, leaving the bridge's approach clear.
  for (let i = 0; i < 14; i++) { const x = 840 + rnd() * 10, y = 260 + i * 28; if (Math.abs(y - 485) > 12) TREES.push([x, y, 6]); }
  for (let i = 0; i < 16; i++) { const x = 822 + rnd() * 8, y = 250 + i * 28 + rnd() * 8; if (Math.abs(y - 485) > 14) TREES.push([x, y, 5 + rnd() * 2]); }
  for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, r = 30 + rnd() * 12; TREES.push([290 + Math.cos(a) * r, 690 + Math.sin(a) * r * 0.8, 5 + rnd() * 3]); }
}

// Street trees, as on the route poster's tree-lined avenues: both sides of every road at a steady
// spacing, except where they'd stand in a building, at a door, on a bus stop, in a park or on
// another road. Computed from the server's places, so they follow the map.
export function streetTrees(buildings, stops, parks) {
  const out = [], spacing = 30, offset = 11;
  const nearRoad = (x, y) => ROADS.some(r => r.pts.slice(1).some((b, i) => {
    const a = r.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) < 8.5;
  }));
  const blocked = (x, y) => buildings.some(b => {
    const f = footprint(b);
    return (x > f.x0 - 5 && x < f.x1 + 5 && y > f.y0 - 5 && y < f.y1 + 7) || Math.hypot(x - b.door[0], y - b.door[1]) < 14;
  }) || stops.some(s => Math.hypot(x - s.at[0], y - s.at[1]) < 14)
    || parks.some(p => { const sh = PARK_SHAPES[p.id] || { rx: 30, ry: 28 }; return ((x - p.door[0]) / (sh.rx + 6)) ** 2 + ((y - p.door[1]) / (sh.ry + 6)) ** 2 < 1; })
    || (x > RIVER.x0 - RIVER.promenade - 4) || Math.abs(y - BRIDGE.y) < BRIDGE.width && x > 790;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    for (let d = spacing / 2; d < len; d += spacing) for (const side of [-1, 1]) {
      const x = ax + ux * d - uy * offset * side, y = ay + uy * d + ux * offset * side;
      if (!nearRoad(x, y) && !blocked(x, y)) out.push([x, y, 4.6 + ((Math.round(x) * 7 + Math.round(y) * 13) % 10) / 10]);
    }
  }
  return out;
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
