#!/usr/bin/env python3
"""Generates the town art prompt pack from the game's data, so it never drifts from the game.

Writes art/PROMPT_PACK_TOWN.md (to read) and art/prompts_town.html (to copy prompts from on a
phone): one self-contained image prompt per place, bus stop, bus view, construction stage and
ground tile, each ending with the file name to save the picture as.

Usage: scripts/town_prompts.py            regenerate both files
       scripts/town_prompts.py --check    exit 1 if a location, stop or line in the data has no
                                          prompt, or if the generated files are stale

Everything about a place comes from data/world, data/transit, data/city and data/config. The
art direction lines (what a building should look like beyond its description) are written here
and are labelled "(art direction)" in the facts, as PROMPT_PACK.md does.
"""
import argparse
import html
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MD_PATH = ROOT / "art" / "PROMPT_PACK_TOWN.md"
HTML_PATH = ROOT / "art" / "prompts_town.html"
SELF = "scripts/town_prompts.py"

# ----------------------------------------------------------------------------------------------
# Style sheet. STYLE_SHORT is repeated at the top of every prompt so each one can be pasted alone.
# The look follows art/STYLE.md (the owner's reference art: the Line 1 route poster, the transit
# card, the golden river on the laptop, the law-office interior): golden-hour light, ivory and sand
# stone, champagne-gold trim and serif lettering, deep emerald accents, lush sage trees with warm
# lights, lit amber windows. Sprites keep that light and palette but share one camera and drop the
# sky, so that every piece fits the same map.
# ----------------------------------------------------------------------------------------------
STYLE_SHORT = (
    "LIVÉRA town sprite. Isometric 2:1 (30°) view from the south-west, warm golden-hour light from "
    "the west with a soft champagne glow, warm amber light in the windows, clean photoreal render, no "
    "outlines, no sky. The Livéra palette: ivory and sand stone, champagne-gold trim and serif "
    "lettering, deep emerald green accents (awnings, doors, sign plates), warm brick only where named, "
    "charcoal glass with thin gold edges, lush rounded sage-green trees with a few tiny warm lights, pale "
    "cream paving. Transparent background, no ground shadow outside the footprint, no people, no cars, "
    "no text except the sign named below. Scale: a door is 1 unit tall; a one-storey shop is about 3 units."
)

STYLE_SHEET = """\
Every prompt below repeats this in brief, so you can paste any single prompt on its own.

- **View.** Isometric 2:1 (a 30° dimetric view), camera from the south-west, so the front and the
  left side of a building are visible. The same angle for every sprite, or they will not sit
  together on the map.
- **Light.** Warm golden-hour light from the west, the same in every sprite: a soft champagne
  glow on the stone, warm amber light in the windows, shadows soft and kept inside the footprint.
  The sky itself is left out (it cannot be shared between tiles); the map draws the sky and moves
  it through the day.
- **Palette (art/STYLE.md, sampled from the owner's reference art).** Ivory and sand stone
  (#f7ecd6, #f0dec2, #d9c9a9), champagne gold for trim and lettering (#dabb85), deep emerald for
  awnings, doors and sign plates (#0b2b23), sage and olive planting (#939c87, #7a8161), warm brick
  (#ad734e) only where a prompt names brick, charcoal glass with thin gold edges for towers and
  offices, pale cream paving.
- **Motifs.** The gold lotus mark on Livéra's own things (transit, civic signs where a prompt asks);
  rounded lush trees with a few tiny warm lights; brass lamps; no neon except the nightclub.
- **Sprite.** "Transparent background, no ground shadow outside the footprint": the image model
  supports transparency. One building per image. Nothing else in frame: no street, no neighbours,
  no sky.
- **No people, no cars.** The town's population is abstract numbers and driving does not exist.
  The only vehicle is the Line 1 bus, which has its own prompts.
- **Signage.** The real name, at most two words, in gold serif capitals. Image models misspell
  longer text. If an accent (LIVÉRA, LUMIÈRE, ÉCLAT) comes out wrong, generate again or accept
  the plain letters and say so in the manifest notes.
- **Size.** 1024×1024 for small places, tiles and the bus front and rear; 1536×1024 for long
  buildings and the bus side; 1024×1536 (portrait) for the two tall things, the Lexington tower
  and the crane.
- **Scale rule.** A door is 1 unit tall and a one-storey shop is about 3 units, so a four-storey
  block is about 12 units and the Lexington is far taller. Keep doors the same size everywhere.
- **Honesty.** Draw only what the data says. Where a prompt adds a detail that is not in the data
  it is marked "(art direction)" in the facts. Station 1 Fire & Rescue is a placeholder landmark.
  The Underpass sells illegal things after dark: draw the corner, never the trade.
"""

HONESTY_NOTES = """\
- The street layout, building shapes, the river and the parks' outlines are the sketch client's
  (`web/client/layout.js`), not game data. The data gives each place a door coordinate, a type, a
  district, a description, hours and access, and that is what these prompts are built from.
- No data file gives the river a shape. Six descriptions mention it and the Riverside district is
  named after it, and the sketch draws it along the east edge of the map. The river-edge tile is
  offered on that basis.
- Apartment and condo units that share a door are one building in the game's map, so they get one
  prompt and one file, named by the id prefix the client uses (`lexington`, `maple_court`,
  `riverside_lofts`, `lakeview`).
- Construction sites get two prompts, the bare site and the framed stage, because the client
  draws a rising frame and a crane while a project is active. Nothing in the data says what a
  half-built building looks like; the framed stage is art direction.
- `art/places/body_balance.jpg` already exists as a photograph. Its sprite is still listed here
  because the map needs the isometric one.
- When a generated picture gets a fact wrong, say so in `art/manifest.json` under `notes`, as the
  other art does. Nobody should mistake a picture for the game's state.
"""

# Plain-language type names for the prompts (matches web/client/layout.js TYPE_NAMES).
TYPE_NAMES = {
    "apartment": "apartment", "condo": "condo", "townhouse": "townhouse", "house": "house",
    "apartment_building": "apartment block", "coffee_shop": "café", "grocery": "grocery store",
    "boutique": "boutique", "recording_studio": "recording studio", "nightclub": "nightclub", "gym": "gym",
    "wellness_studio": "therapy and wellness studio", "office": "office", "tech_office": "tech startup office",
    "newsroom": "newsroom", "event_agency": "event agency", "creative_agency": "creative agency",
    "construction_office": "construction site office", "clinic": "walk-in clinic", "church": "church",
    "civic": "civic building", "community_center": "community center", "park": "park",
    "clothing_store": "clothing store", "electronics_store": "electronics store", "pharmacy": "pharmacy",
    "jeweler": "jeweler", "salon": "salon", "bar": "bar", "university": "university", "hospital": "hospital",
    "law_firm": "law firm", "street_corner": "street corner", "restaurant": "restaurant", "cinema": "cinema",
    "sports_field": "soccer field", "sports_court": "basketball court", "clubhouse": "clubhouse",
    "animal_shelter": "pet adoption center", "vet": "veterinary clinic", "laundromat": "laundromat",
    "school": "school", "daycare": "daycare", "construction_site": "construction site",
}

# Art direction per place: what to draw beyond the data's description. Not game data.
DIRECTION = {
    "james_wellness": "a two-storey glass-fronted studio with warm lamplight inside, a simple lotus mark beside the name and potted palms at the door",
    "low_end_studios": "a converted brick warehouse with a small lit sign and a glimpse of a mixing console through one window",
    "ellis_atelier": "a narrow black-framed shopfront with one rail of black garments visible and a minimal ivory serif name",
    "whitaker_capital": "a glass office tower with a walnut-lined lobby and an architectural model visible inside the ground floor",
    "common_ground": "a friendly brick building with a hand-painted noticeboard and warm light in big windows",
    "parallax_labs": "a modern glass office block with a whiteboard wall glowing through the glass",
    "livera_ledger": "a small storefront newsroom with gold-leaf lettering on the window",
    "baptiste_events": "an elegant ground-floor studio with white flowers in the window",
    "lumen_creative": "an open-plan studio behind tall glass with a lit wordmark",
    "meridian_talent": "a fresh glass-and-stone office entrance with brushed-gold lettering",
    "heritage_coffee": "a brick corner café with big windows showing a long communal table and a chalkboard by the door",
    "greenleaf_market": "a new grocery with a green awning and some shelves visibly empty through the windows",
    "forge_site_office": "two stacked site trailers behind a temporary fence, plans visible through a window",
    "riverdale_clinic": "a clean single-storey clinic with a simple cross symbol",
    "livera_general": "a new hospital block with a lit EMERGENCY entrance and an empty gravel lot beside it",
    "greater_hope": "a modest brick church with a white steeple and open double doors",
    "police_station": "a civic brick building with flagpoles and an invented crest; no real department marks",
    "fire_station": "a closed engine-bay door, no trucks and no crew: the data marks it as a placeholder landmark, so never present it as a working fire station",
    "thread_co": "a friendly shopfront with clothing racks and a sale bin at the entrance",
    "circuit_electronics": "a bright white interior visible through glass, unbranded devices on white tables",
    "riverdale_pharmacy": "a pharmacy shopfront with a simple green cross",
    "lustre_jewelers": "a black-and-gold storefront with softly lit glass cases",
    "fade_glow": "a salon window showing three barber chairs and a pole striped gold and black",
    "livera_university": "a new campus building with a young lawn, one hall finished and a second still framed",
    "hale_partners": "a discreet glass entrance with a brass nameplate and a conference room visible upstairs",
    "copper_tap": "a warm-lit pub front with copper trim and the long bar glowing inside",
    "the_underpass": "an empty corner under raw concrete overpass beams; no people and nothing for sale shown",
    "founders_school": "one long brick school building with a flagpole, empty",
    "little_sprouts": "a bright, colourful but tasteful entrance with a small fenced play yard, empty",
    "suds_spin": "rows of washers and dryers through the window and one bench",
    "lumiere_bistro": "a small bistro with an awning and candlelit tables through the glass",
    "starlight_cinema": "a marquee with warm bulbs and red-velvet tones in the lobby",
    "riverside_field": "an empty grass pitch with four floodlight masts and a small grandstand along one side",
    "riverside_court": "an empty outdoor court with new nets on two hoops and old bleachers along one side",
    "riverside_clubhouse": "a small two-storey clubhouse with a league office window upstairs",
    "paws_whiskers": "a cheerful shelter front with a paw-print mark and a rabbit visible in a window",
    "founders_animal_hospital": "a clean vet clinic with a paw-and-cross mark and a lit door",
    "founders_park": "a small green with a dry fountain in the middle, staked young trees, a path and two benches, seen from the same isometric angle",
    "willow_lake_park": "a small lake ringed by willows with a short boardwalk, a tiny boathouse with rowboats tied up, and picnic lawns",
    "founders_way_site": "a dirt road with graders and a paving machine parked on it, with cones and a sand heap; no crew",
    "maple_court_ii_site": "a fenced lot with lumber stacks, a site hut and the first concrete slab; no workers",
    "body_balance_site": "a fenced lot beside the park with a dug foundation, rebar and a site hut; no workers",
    "eclat_site": "an empty fenced riverside parcel with weeds, a surveyor's stakes and a leaning site board; no workers",
    "maple_court_ii": "a new four-storey brick-and-render block with small balconies, the twin of the first Maple Court block",
    "body_balance": "a two-storey glass-fronted gym with warm wood slats, a rooftop planter and a lotus mark beside the name, as in the existing photograph art/places/body_balance.jpg",
    "eclat": "a low black-and-gold nightclub with a velvet rope at the door and a terrace on the river side",
    "founders_row_3": "a brick townhouse with plants on the stoop and books visible in the window",
    "founders_row_7": "a narrow brick townhouse with blackout curtains drawn",
}
DIRECTION_HOUSE = "a modest two-storey detached house with a porch, a young tree and a glimpse of the back yard"
DIRECTION_GROUP = {
    "lexington": "a slim glass tower with cream stone at the base and a lit lobby, the tallest thing in town",
    "maple_court": "a new four-storey brick-and-render block with small balconies and a single street door",
    "riverside_lofts": "a converted brick warehouse with big black steel windows and a loading-dock door turned into the entrance (art direction: the data describes only the units)",
    "lakeview": "a low-rise condo block with balconies on the lake side",
}
STOREYS_GROUP = {
    "lexington": "The units are numbered up to 1801 and the penthouse is the top floor, so draw at least nineteen floors",
    "maple_court": "The units are 1A to 4C, so draw four floors",
    "riverside_lofts": "The data gives no floor count; draw three tall loft storeys (art direction)",
    "lakeview": "The units are 1A to 4C, so draw four floors",
}
GROUP_NAMES = {"lexington": "The Lexington", "maple_court": "Maple Court", "riverside_lofts": "Riverside Lofts", "lakeview": "Lakeview Condos"}
UNIT_TYPES = {"apartment", "condo"}
# Signs that the two-word rule gets wrong on its own. None means no sign at all.
SIGN_OVERRIDES = {
    "livera_general": "GENERAL HOSPITAL", "founders_animal_hospital": "ANIMAL HOSPITAL", "the_underpass": None,
    "fire_station": "STATION 1",
}
LONG_TYPES = {"apartment_building", "hospital", "university", "school", "sports_field", "cinema", "grocery", "community_center"}
LONG_IDS = {"founders_way_site", "maple_court", "riverside_lofts", "lakeview", "riverside_field"}
TALL_IDS = {"lexington"}
SIZE_SQUARE, SIZE_LONG, SIZE_TALL = "1024×1024", "1536×1024", "1024×1536"

# Ground tiles. The lane markings and colours are the sketch client's (web/client/render2d.js):
# warm charcoal asphalt with a single dashed cream centre line and no edge lines; gravel while a road
# is still being paved; olive ground, darker park green; a blue-grey river.
TILES = [
    ("road_straight", "Road, straight",
     "one straight two-way road running from the south-west edge to the north-east edge of the tile, warm charcoal asphalt, "
     "a single dashed cream centre line, no edge lines, no kerb (the sidewalk is a separate tile)"),
    ("road_corner", "Road, corner",
     "a road entering from the south-west edge and turning to leave by the south-east edge, warm charcoal asphalt, the dashed "
     "cream centre line following the bend, no edge lines, no kerb"),
    ("road_t", "Road, T junction",
     "a road running south-west to north-east with a second road joining from the south-east edge, warm charcoal asphalt, "
     "dashed cream centre lines that stop short of the junction, no edge lines, no kerb"),
    ("road_crossroad", "Road, crossroad",
     "two roads crossing at the centre of the tile, warm charcoal asphalt, dashed cream centre lines that stop short of the "
     "crossing, no edge lines, no kerb, no stop lines or crosswalk"),
    ("road_gravel", "Road, unpaved",
     "one straight unpaved road running from the south-west edge to the north-east edge, packed tan gravel with tyre "
     "ruts and no markings (the sketch draws Founders Way like this until its paving project completes)"),
    ("sidewalk", "Sidewalk",
     "pale cream stone paving slabs in a regular grid, the pavers slightly uneven, a thin darker joint between them"),
    ("grass", "Grass",
     "short sage-green grass with a little variation and a few lighter blades in warm light, nothing else"),
    ("river_edge", "River edge",
     "the south-west half of the tile is pale stone paving ending in a low cream stone embankment with a thin black "
     "iron railing, and the north-east half is calm blue-teal river water with faint ripples catching gold light"),
    ("bridge", "Arched stone bridge",
     "an arched stone footbridge in cream stone with four round arches, a low balustrade topped with thin gold lamp posts, "
     "spanning from the lower-left to the upper-right of the frame as if crossing a river, with no water drawn (the map draws "
     "the river); like the bridge on the Livéra transit card and the golden river picture"),
    ("crane", "Tower crane",
     "a yellow-gold tower crane standing on a small concrete base, mast, jib, counter-jib and a hook on a thin cable; "
     "the crane fills the height of the frame, seen from the same south-west isometric angle"),
]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_data():
    locations, properties = [], {}
    for f in sorted((DATA / "world").glob("*.json")):
        d = load_json(f)
        for loc in d.get("locations", []):
            loc["_file"] = f.relative_to(ROOT).as_posix()
            locations.append(loc)
        for p in d.get("properties", []):
            properties[p["location"]] = p
    transit = load_json(DATA / "transit" / "transit.json")["transit"]
    city = load_json(DATA / "city" / "founding_city.json")
    sim = load_json(DATA / "config" / "simulation.json")["simulation"]
    return locations, properties, transit, city, sim


def fmt_hours(h):
    if not h:
        return None
    a, b = h
    s = f"{a:02d}:00–{b:02d}:00"
    return s + " (past midnight)" if b < a else s


DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def fmt_days(days):
    if not days:
        return None
    if days == list(range(days[0], days[-1] + 1)) and len(days) > 1:
        return f"{DAYS[days[0]]}–{DAYS[days[-1]]}"
    return ", ".join(DAYS[d] for d in days)


def money(cents):
    return f"${cents / 100:,.0f}"


def sign_for(loc_id, name, loc_type):
    if loc_id in SIGN_OVERRIDES:
        return SIGN_OVERRIDES[loc_id]
    if loc_type in ("construction_site",):
        return None
    if loc_type in ("house", "townhouse"):
        return name.split()[0]  # the house number
    words = name.split(", ")[0].split()
    if words and words[0].lower() == "the":
        words = words[1:]
    out, count = [], 0
    for w in words:
        if w == "&":
            out.append(w)
            continue
        if count == 2:
            break
        out.append(w)
        count += 1
    while out and out[-1] == "&":
        out.pop()
    return " ".join(out).upper()


def size_for(key, loc_type=None):
    if key in TALL_IDS:
        return SIZE_TALL
    if key in LONG_IDS or loc_type in LONG_TYPES:
        return SIZE_LONG
    return SIZE_SQUARE


def sign_line(sign):
    if sign is None:
        return "No sign and no text anywhere in the image."
    return f'The only text is the sign "{sign}" in champagne-gold serif capitals, spelled exactly like that.'


def access_line(loc):
    access = loc.get("access")
    if access == "residents":
        return "It is a home (residents only): a plain street door, no shop window, no shop sign other than the name."
    if access == "staff":
        return "It is a workplace (staff only): an office entrance with a nameplate, no shop window display."
    return None


def hours_line(loc, sign):
    h = fmt_hours(loc.get("hours"))
    days = fmt_days(loc.get("open_days"))
    if not h:
        return None
    s = f"It is open {h}"
    if days:
        s += f", {days}"
    if loc["hours"][1] < loc["hours"][0] or loc["hours"][0] >= 16:
        lit = "so give it a sign that could light up, but draw" if sign else "but draw"
        return f"{s}: a night place, {lit} it in the same golden-hour light as everything else."
    return s + "."


def outdoor_line(loc):
    if loc.get("enterable") is False and loc["type"] != "park":
        return f"Nobody can go inside it in the game: it is used from outside, within {loc.get('outdoor_radius_m')} m of the door."
    return None


def article(noun):
    return ("an " if noun[:1].lower() in "aeiou" else "a ") + noun


def finish(parts, size, save_as):
    text = " ".join(p for p in parts if p)
    return f"{STYLE_SHORT}\n\n{text}\n\nSize {size}, transparent background. Save as {save_as}"


def place_facts(loc, properties, projects_by_site, projects_by_opens):
    facts = [("Name", loc["name"]), ("Id", loc["id"]), ("Type", loc["type"]), ("District", loc["district"]),
             ("Door", f"({loc['door'][0]}, {loc['door'][1]}) m"), ("Description", loc["description"])]
    h = fmt_hours(loc.get("hours"))
    facts.append(("Hours", h + (f", {fmt_days(loc['open_days'])}" if loc.get("open_days") else "") if h else "none in the data"))
    if loc.get("access"):
        facts.append(("Access", loc["access"]))
    if loc.get("enterable") is False:
        facts.append(("Enterable", f"no: an outdoor place with a {loc.get('outdoor_radius_m')} m radius"))
    if loc.get("stage"):
        facts.append(("Stage", "yes: performers can play here"))
    if loc.get("weddings"):
        facts.append(("Weddings", "yes"))
    if loc.get("offers"):
        facts.append(("Sells", ", ".join(o["label"] for o in loc["offers"])))
    p = properties.get(loc["id"])
    if p:
        facts.append(("Property", f"{p['bedrooms']} bedrooms, {', '.join(a.replace('_', ' ') for a in p['amenities'])}; "
                                  f"market value {money(p['market_value_cents'])}" + (", for sale" if p.get("for_sale") else "")))
    proj = projects_by_site.get(loc["id"]) or projects_by_opens.get(loc["id"])
    if proj:
        what = "Project on this site" if loc["id"] in projects_by_site else "Opens when this project completes"
        facts.append((what, f"{proj['name']} ({proj['id']}): crew of {proj['crew_size']}, {proj['worker_hours_required']} worker-hours, "
                            f"working {fmt_hours(proj['work_hours'])} on {fmt_days(proj['work_days'])}"
                            + (f"; starts after {proj['starts_after']}" if proj.get("starts_after") else "")))
    facts.append(("Source", loc["_file"]))
    return facts


def build_prompts(locations, properties, transit, city, sim):
    prompts = []
    projects_by_site = {p["site"]: p for p in city["construction_projects"]}
    projects_by_opens = {p["opens_location"]: p for p in city["construction_projects"] if p.get("opens_location")}
    bounds = sim["world_bounds"]

    # Group apartment and condo units by door, the way the client does (web/client/layout.js).
    groups, group_order = {}, []
    for loc in locations:
        if loc["type"] in UNIT_TYPES:
            key = next((g for g in GROUP_NAMES if loc["id"].startswith(g)), None) or f"{loc['door'][0]}_{loc['door'][1]}"
            if key not in groups:
                groups[key] = {"units": [], "door": loc["door"], "district": loc["district"], "type": loc["type"]}
                group_order.append(key)
            groups[key]["units"].append(loc)

    for key in group_order:
        g = groups[key]
        units = g["units"]
        name = GROUP_NAMES.get(key, units[0]["name"].split(", ")[0])
        sign = sign_for(key, name, "apartment_building")
        direction = DIRECTION_GROUP.get(key, "a new mid-rise residential block with a single street door")
        storeys = STOREYS_GROUP.get(key, "The data gives no floor count")
        unit_descs = sorted({u["description"] for u in units})
        quoted = " ".join(f'"{d}"' for d in unit_descs[:3])
        parts = [f"{name}: {article(TYPE_NAMES.get(g['type'], g['type']))} building in the {g['district']} district with {len(units)} units in the game.",
                 f"The game describes the units like this: {quoted}",
                 f"Draw {direction}. {storeys}.",
                 "It is a home (residents only): one street door, no shop window.", sign_line(sign)]
        facts = [("Building", name), ("Client id", key), ("District", g["district"]), ("Door", f"({g['door'][0]}, {g['door'][1]}) m, shared by every unit"),
                 ("Units", ", ".join(u["name"].split(", ", 1)[-1] + f" ({u['id']})" for u in units))]
        for d in unit_descs:
            who = [u["name"].split(", ", 1)[-1] for u in units if u["description"] == d]
            facts.append((", ".join(who), d))
        props = [properties[u["id"]] for u in units if u["id"] in properties]
        if props:
            facts.append(("Property", f"{props[0]['bedrooms']}-bedroom units, {', '.join(a.replace('_', ' ') for a in props[0]['amenities'])}; "
                                      f"market values {money(min(p['market_value_cents'] for p in props))}–{money(max(p['market_value_cents'] for p in props))}"))
        facts.append(("Art direction", f"{direction}. {storeys}."))
        facts.append(("Source", ", ".join(sorted({u['_file'] for u in units}))))
        save_as = f"art/places/{key}.png"
        prompts.append({"id": f"place_{key}", "section": "homes", "district": g["district"], "title": f"{name} ({len(units)} units)",
                        "save_as": save_as, "size": size_for(key), "sign": sign, "covers": [u["id"] for u in units],
                        "prompt": finish(parts, size_for(key), save_as), "facts": facts})

    for loc in locations:
        if loc["type"] in UNIT_TYPES:
            continue
        lid, ltype = loc["id"], loc["type"]
        tname = TYPE_NAMES.get(ltype, ltype.replace("_", " "))
        sign = sign_for(lid, loc["name"], ltype)
        direction = DIRECTION.get(lid) or (DIRECTION_HOUSE if ltype == "house" else f"{article(tname)} that matches its description")
        facts = place_facts(loc, properties, projects_by_site, projects_by_opens)
        facts.append(("Art direction", direction))
        proj = projects_by_opens.get(lid)
        if ltype == "construction_site":
            proj = projects_by_site.get(lid)
            what = proj["name"] if proj else "a project"
            base = [f"{loc['name']}: a construction site in the {loc['district']} district, where {what} is being built.",
                    f'The game describes it: "{loc["description"]}"']
            for stage, label, extra in (
                ("site", "bare site", f"Draw {direction}. This is the site before work shows above ground."),
                ("framed", "framed stage",
                 "Draw the same lot later: a rising structural frame of concrete columns and beams, formwork, scaffolding and a "
                 "tower crane standing over it, lumber stacks and a temporary fence; no workers. (The game only says the project is "
                 "active; what the frame looks like is art direction.)"
                 if lid != "founders_way_site" else
                 "Draw the same road later: half of it freshly paved warm charcoal asphalt with a dashed cream centre line, the other half "
                 "still gravel, the paving machine at the join, cones; no crew."),
            ):
                save_as = f"art/places/{lid}.png" if stage == "site" else f"art/places/{lid}_framed.png"
                size = size_for(lid, ltype)
                prompts.append({"id": f"place_{lid}_{stage}", "section": "construction", "district": loc["district"],
                                "title": f"{loc['name']} — {label}", "save_as": save_as, "size": size, "sign": sign, "covers": [lid],
                                "prompt": finish(base + [extra, sign_line(sign)], size, save_as), "facts": facts})
            continue
        parts = [f"{loc['name']}: {article(tname)} in the {loc['district']} district.",
                 f'The game describes it: "{loc["description"]}"',
                 f"Draw {direction}.", access_line(loc), hours_line(loc, sign), outdoor_line(loc)]
        if ltype == "park":
            parts.append("It is an outdoor place: draw the whole park as one sprite, with no building, and keep the grass inside the footprint.")
        if proj:
            parts.append(f"It opens only when the project \"{proj['name']}\" completes; this is the finished building.")
        if ltype == "house":
            parts.append(f"The house number {sign} is on the porch post.")
        parts.append(sign_line(sign))
        save_as = f"art/places/{lid}.png"
        size = size_for(lid, ltype)
        section = "homes" if loc.get("access") == "residents" else ("finished" if proj else "places")
        prompts.append({"id": f"place_{lid}", "section": section, "district": loc["district"], "title": loc["name"],
                        "save_as": save_as, "size": size, "sign": sign, "covers": [lid],
                        "prompt": finish(parts, size, save_as), "facts": facts})

    # Transit: every stop of every line, then the bus.
    for line in transit["lines"]:
        stops = line["stops"]
        for i, stop in enumerate(stops):
            sign = sign_for(stop["id"], stop["name"], "stop")
            nearest = sorted(((math.dist(stop["at"], l["door"]), l) for l in locations), key=lambda t: t[0])[:2]
            near_txt = "; ".join(f"{l['name']} ({d:.0f} m)" for d, l in nearest)
            prev_stop, next_stop = stops[i - 1]["name"], stops[(i + 1) % len(stops)]["name"]
            parts = [f"Bus shelter for the stop \"{stop['name']}\", stop {i + 1} of {len(stops)} on {line['name']}, the town's only bus line.",
                     "Draw a small glass-and-black-steel bus shelter on a short strip of pale stone paving: a flat black roof with a thin gold "
                     "edge, one wooden bench, a slim black totem sign at the near end with a gold \"1\" badge and the stop name, "
                     "a small Livéra lotus mark on the roof fascia (art direction from the existing shelter pictures).",
                     f'Text on the totem, nothing else: "1" and "{sign}".']
            save_as = f"art/transit/stops/{stop['id']}.png"
            facts = [("Stop", stop["name"]), ("Id", stop["id"]), ("Line", f"{line['name']} ({line['id']})"), ("Order", f"{i + 1} of {len(stops)}, after {prev_stop}, before {next_stop}"),
                     ("Position", f"({stop['at'][0]}, {stop['at'][1]}) m"), ("Nearest places", near_txt),
                     ("Fare", f"${line['fare_cents'] / 100:.2f}"),
                     ("Line hours", fmt_hours(line["hours"])), ("Source", "data/transit/transit.json")]
            prompts.append({"id": f"stop_{stop['id']}", "section": "transit", "district": "", "title": f"Stop: {stop['name']}",
                            "save_as": save_as, "size": SIZE_SQUARE, "sign": f"1 · {sign}", "covers": [stop["id"]],
                            "prompt": finish(parts, SIZE_SQUARE, save_as), "facts": facts})
        bus_facts = [("Line", f"{line['name']} ({line['id']})"), ("Fare", f"${line['fare_cents'] / 100:.2f}"), ("Hours", fmt_hours(line["hours"])),
                     ("Speed", f"{line['speed_mps']} m/s (walking is {sim['walk_speed_mps']} m/s)"), ("Stops", " → ".join(s["name"] for s in stops) + " → back to the start"),
                     ("Livery", "(art direction, from the route poster art/transit/route_line_1.jpg and art/STYLE.md) deep emerald body, black glass "
                                "window band, champagne-gold trim and stripe, gold lotus mark, LIVÉRA TRANSIT wordmark, gold 1 badge, destination "
                                "sign 1 RIVERSIDE LOOP"), ("Source", "data/transit/transit.json")]
        livery = ("Livery from the Livéra route poster: a deep emerald body, a black glass window band, a champagne-gold stripe and trim, a "
                  "small gold lotus mark, the words \"LIVÉRA TRANSIT\" in gold serif capitals, a gold \"1\" badge, no manufacturer badges and no "
                  "other text.")
        views = [("front", "the front three-quarter view from the south-west, the destination sign over the windscreen reading \"1 RIVERSIDE LOOP\"", SIZE_SQUARE),
                 ("side", "the full left side, the bus facing left, both doors closed, the LIVÉRA TRANSIT wordmark along the side", SIZE_LONG),
                 ("rear", "the rear three-quarter view from the south-west, a small gold \"1\" on the back and the LIVÉRA TRANSIT wordmark", SIZE_SQUARE)]
        for view, desc, size in views:
            save_as = f"art/transit/bus_{line['id']}_{view}.png"
            parts = [f"The {line['name']} bus, the town's only vehicle: a modern low-floor city bus, {desc}.", livery,
                     "Empty: no driver, no passengers. The bus sits on nothing: transparent background right up to the tyres."]
            prompts.append({"id": f"bus_{line['id']}_{view}", "section": "transit", "district": "", "title": f"Bus: {line['name']}, {view} view",
                            "save_as": save_as, "size": size, "sign": "LIVÉRA TRANSIT · 1", "covers": [line["id"]],
                            "prompt": finish(parts, size, save_as), "facts": bus_facts})

    # Tiles.
    for tid, title, desc in TILES:
        size = SIZE_TALL if tid == "crane" else SIZE_LONG if tid == "bridge" else SIZE_SQUARE
        if tid == "crane":
            parts = [f"Tower crane sprite for building sites. Draw {desc}.", "No text, no people, no building."]
            facts = [("Used by", "the sketch client draws a gold crane over every active construction project"), ("Colour", "#e0a23a (web/client/render2d.js)")]
        elif tid == "bridge":
            parts = [f"Bridge sprite. Draw {desc}.", "No text, no people, no cars."]
            facts = [("Used by", "the sketch client draws an arched bridge over the river on the line of Lexington Avenue (web/client/layout.js)"),
                     ("Honesty", "The bridge is part of the sketch, like the river: no data file has a bridge, and nobody can cross it in the game.")]
        else:
            parts = [f"Ground tile: {title.lower()}. One seamless isometric ground tile, a 2:1 diamond that touches all four edges of the frame, "
                     f"transparent outside the diamond, flat with no height. Draw {desc}.",
                     "The pattern must continue cleanly into the same tile placed on any side. No text, no objects, no shadows."]
            facts = [("Used by", "the map ground; the sketch client's colours and lane markings are in web/client/render2d.js and layout.js")]
        if tid == "river_edge":
            facts.append(("Honesty", "No data file gives the river a shape: six place descriptions mention it and the sketch draws it along the east edge (x 860–1000 m)."))
        if tid == "road_gravel":
            facts.append(("From the data", "Founders Way stays unpaved until the project founders_way (540 worker-hours) completes."))
        facts.append(("World", f"{bounds['max'][0] - bounds['min'][0]}×{bounds['max'][1] - bounds['min'][1]} m, 1 m per unit (data/config/simulation.json)"))
        save_as = f"art/tiles/{tid}.png"
        prompts.append({"id": f"tile_{tid}", "section": "tiles", "district": "", "title": f"Tile: {title}", "save_as": save_as, "size": size,
                        "sign": None, "covers": [], "prompt": finish(parts, size, save_as), "facts": facts})
    return prompts


SECTIONS = [("places", "Places"), ("homes", "Homes"), ("finished", "Buildings that open when a project completes"),
            ("construction", "Construction sites (two stages each)"), ("transit", "Transit"), ("tiles", "Ground tiles and the crane")]


def ordered(prompts, section):
    return sorted((p for p in prompts if p["section"] == section), key=lambda p: (p["district"], p["title"]))


def render_markdown(prompts, counts):
    out = ["# LIVÉRA town art prompt pack", "",
           f"Generated by `{SELF}` from `data/world`, `data/transit`, `data/city` and `data/config`. Do not edit by hand: "
           f"rerun the script after changing the data, and `python3 {SELF} --check` fails when this file is stale or a place has no prompt.",
           "",
           f"{len(prompts)} prompts: {counts['locations']} locations ({counts['unit_locations']} apartment and condo units folded into "
           f"{counts['groups']} buildings), {counts['stops']} bus stops, {counts['lines']} bus line in three views, "
           f"{counts['construction']} construction sites in two stages, {counts['tiles']} tiles. The phone page `art/prompts_town.html` has "
           "the same prompts with a Copy button and a done checkbox.", "",
           "## How to use (on a phone)", "",
           "1. Open `art/prompts_town.html` and tap **Copy** on a card.",
           "2. Paste into the image generator. Each prompt already carries the style sheet, the size and the transparent background.",
           "3. Check the sign spelling, that nobody and no car is in the picture, and that the angle matches the other sprites.",
           "4. Save the file under the name at the end of the prompt, add it to `art/manifest.json`, and write anything the picture "
           "gets wrong under `notes`.",
           "5. Tick **done** on the card. The page remembers it on that phone.", "",
           "## Style sheet", "", STYLE_SHEET, "## What these prompts are not", "", HONESTY_NOTES]
    for key, label in SECTIONS:
        items = ordered(prompts, key)
        if not items:
            continue
        out += [f"## {label}", ""]
        district = None
        for p in items:
            if p["district"] and p["district"] != district:
                district = p["district"]
                out += [f"### {district}", ""]
            out += [f"#### {p['title']}" + (" (in the game)" if p["filed"] else ""), "",
                    f"Save as `{p['save_as']}` · {p['size']}" + (f" · sign: {p['sign']}" if p["sign"] else " · no sign")
                    + (f" · filed as `{p['filed']}`" if p["filed"] else ""), "",
                    "Facts from the data:", ""]
            out += [f"- **{k}:** {v}" for k, v in p["facts"]]
            out += ["", "```text", p["prompt"], "```", ""]
    out += ["## Adding the pictures", "",
            "Save each file under its prompt's name, then list it in `art/manifest.json` (`places`, `transit.stops`, or a new `tiles` map) "
            "and note under `notes` anything the picture gets wrong about the game, as the existing entries do. The test in "
            "`tests/test_cast.cpp` checks that every manifest path exists and that place and stop ids are the game's.", ""]
    return "\n".join(out)


CSS = """
:root{color-scheme:light dark;--bg:#f6f1e8;--card:#fffdf8;--ink:#1f1a14;--muted:#6b6256;--line:#e3dbcc;--gold:#9a7a3a;--gold-ink:#1b150c;--done:#eef3e6;--pre:#f1ebdf}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161412;--card:#201d19;--ink:#efe7dc;--muted:#a79d8f;--line:#3a342c;--gold:#cfae74;--gold-ink:#1b150c;--done:#1f261b;--pre:#161412}}
:root[data-theme="dark"]{--bg:#161412;--card:#201d19;--ink:#efe7dc;--muted:#a79d8f;--line:#3a342c;--gold:#cfae74;--gold-ink:#1b150c;--done:#1f261b;--pre:#161412}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-x:hidden}
.wrap{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:.2em 0 .3em}h2{font-size:1.2rem;margin:1.6em 0 .5em;border-bottom:1px solid var(--line);padding-bottom:.2em}
h3{font-size:1rem;margin:1.2em 0 .4em;color:var(--muted);font-weight:600}
p,li{overflow-wrap:anywhere}.lead{color:var(--muted);margin:0 0 .6em}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
.bar label{display:flex;gap:6px;align-items:center}
nav a{margin-right:10px;color:var(--gold);text-decoration:none;white-space:nowrap}
details.style{margin:.6em 0}details summary{cursor:pointer;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0}
.card.done{background:var(--done)}
.filed{display:inline-block;font-size:.8rem;font-weight:600;letter-spacing:.04em;padding:2px 8px;border-radius:999px;border:1px solid var(--gold);color:var(--gold);margin-left:6px}
.card h4{margin:0 0 .3em;font-size:1.05rem}.meta{color:var(--muted);font-size:.9rem;margin:0 0 .5em}
.meta code{font-size:.9em}
pre.prompt{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--pre);border-radius:8px;padding:10px;margin:.5em 0;font:.88rem/1.4 ui-monospace,Menlo,Consolas,monospace;max-width:100%;user-select:text}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button.copy{background:var(--gold);color:var(--gold-ink);border:0;border-radius:8px;padding:10px 16px;font-size:1rem;font-weight:600;min-height:44px;cursor:pointer}
button.copy:active{opacity:.8}.row label{display:flex;gap:6px;align-items:center;min-height:44px}
input[type=checkbox]{width:20px;height:20px}
dl{margin:.4em 0 0;font-size:.9rem}dt{font-weight:600;margin-top:.4em;color:var(--muted)}dd{margin:0}
.style pre{white-space:pre-wrap;overflow-wrap:anywhere;font:.85rem/1.4 ui-monospace,Menlo,Consolas,monospace;background:var(--pre);padding:10px;border-radius:8px}
footer{color:var(--muted);font-size:.85rem;margin:2em 0 1em}
""".strip()

JS = """
(function(){
  var KEY='livera.prompts_town.done', HIDE='livera.prompts_town.hide';
  var done={}, hide=false;
  try{done=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){done={};}
  try{hide=localStorage.getItem(HIDE)==='1';}catch(e){hide=false;}
  var cards=Array.prototype.slice.call(document.querySelectorAll('.card'));
  var progress=document.getElementById('progress'), hideBox=document.getElementById('hide-done');
  function save(){try{localStorage.setItem(KEY,JSON.stringify(done));localStorage.setItem(HIDE,hide?'1':'0');}catch(e){}}
  function refresh(){
    var n=0;
    cards.forEach(function(c){var d=!!done[c.getAttribute('data-id')]||c.getAttribute('data-filed')==='1';c.classList.toggle('done',d);c.querySelector('.done-box').checked=d;c.hidden=hide&&d;if(d)n++;});
    progress.textContent=n+' of '+cards.length+' done';
    hideBox.checked=hide;
  }
  function flash(btn,text){var old='Copy';btn.textContent=text;setTimeout(function(){btn.textContent=old;},1600);}
  function selectText(pre){var r=document.createRange();r.selectNodeContents(pre);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}
  function fallbackCopy(pre,btn){
    selectText(pre);var ok=false;
    try{ok=document.execCommand('copy');}catch(e){ok=false;}
    flash(btn,ok?'Copied':'Selected — copy it');
  }
  cards.forEach(function(c){
    var pre=c.querySelector('pre.prompt'), btn=c.querySelector('button.copy'), box=c.querySelector('.done-box');
    btn.addEventListener('click',function(){
      var text=pre.textContent;
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){flash(btn,'Copied');},function(){fallbackCopy(pre,btn);});
      }else{fallbackCopy(pre,btn);}
    });
    box.addEventListener('change',function(){
      var id=c.getAttribute('data-id');
      if(box.checked)done[id]=true;else delete done[id];
      save();refresh();
    });
  });
  hideBox.addEventListener('change',function(){hide=hideBox.checked;save();refresh();});
  refresh();
})();
""".strip()


def esc(s):
    return html.escape(str(s), quote=True)


def render_html(prompts, counts):
    h = esc
    out = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           "<title>LIVÉRA town prompts</title>", f"<style>{CSS}</style>", "</head>", "<body>", '<div class="wrap">',
           "<h1>LIVÉRA town prompts</h1>",
           f'<p class="lead">{len(prompts)} prompts generated by <code>{h(SELF)}</code> from the game\'s data: '
           f"{counts['locations']} locations ({counts['unit_locations']} units in {counts['groups']} buildings), {counts['stops']} stops, "
           f"the bus in three views, {counts['construction']} building sites in two stages and {counts['tiles']} tiles. "
           "Tap Copy, paste into the image generator, save under the name at the end, tick done. "
           f"{counts['filed']} of {len(prompts)} are already in the game and marked as such.</p>",
           '<div class="bar"><strong id="progress">0 done</strong><label><input type="checkbox" id="hide-done"> hide done</label></div>',
           "<nav>" + " ".join(f'<a href="#{h(key)}">{h(label)}</a>' for key, label in SECTIONS if any(p["section"] == key for p in prompts)) + "</nav>",
           '<details class="style"><summary>Style sheet (already inside every prompt)</summary>',
           f"<pre>{h(STYLE_SHORT)}</pre>", "<ul>" + "".join(f"<li>{h(line.strip('- ').strip())}</li>" for line in md_bullets(STYLE_SHEET)) + "</ul>",
           "<p><strong>What these prompts are not</strong></p><ul>" + "".join(f"<li>{h(line)}</li>" for line in md_bullets(HONESTY_NOTES)) + "</ul>",
           "</details>"]
    for key, label in SECTIONS:
        items = ordered(prompts, key)
        if not items:
            continue
        out.append(f'<h2 id="{h(key)}">{h(label)}</h2>')
        district = None
        for p in items:
            if p["district"] and p["district"] != district:
                district = p["district"]
                out.append(f"<h3>{h(district)}</h3>")
            out.append(f'<article class="card" data-id="{h(p["id"])}"' + (' data-filed="1"' if p["filed"] else "") + ">")
            out.append(f"<h4>{h(p['title'])}" + (f' <span class="filed">In the game: {h(p["filed"])}</span>' if p["filed"] else "") + "</h4>")
            out.append(f'<p class="meta">Save as <code>{h(p["save_as"])}</code> · {h(p["size"])} · ' + (f"sign: {h(p['sign'])}" if p["sign"] else "no sign") + "</p>")
            out.append(f'<pre class="prompt">{h(p["prompt"])}</pre>')
            out.append('<div class="row"><button type="button" class="copy">Copy</button>'
                       '<label><input type="checkbox" class="done-box"> done</label></div>')
            out.append("<details><summary>Facts from the data</summary><dl>" + "".join(f"<dt>{h(k)}</dt><dd>{h(v)}</dd>" for k, v in p["facts"]) + "</dl></details>")
            out.append("</article>")
    out += ["<footer>No external resources. The done ticks live in this browser's localStorage only. "
            "When a picture gets a fact wrong, say so in art/manifest.json under notes.</footer>",
            "</div>", f"<script>{JS}</script>", "</body>", "</html>", ""]
    return "\n".join(out)


def md_bullets(text):
    """Joins the wrapped '- ' bullets of a Markdown block into single lines (Markdown bold removed)."""
    items, cur = [], None
    for line in text.splitlines():
        if line.startswith("- "):
            if cur is not None:
                items.append(cur)
            cur = line[2:].strip()
        elif cur is not None and line.strip():
            cur += " " + line.strip()
    if cur is not None:
        items.append(cur)
    return [i.replace("**", "").replace("`", "") for i in items]


def coverage(prompts, locations, transit):
    covered = set()
    for p in prompts:
        covered.update(p["covers"])
    missing = [l["id"] for l in locations if l["id"] not in covered]
    missing += [s["id"] for line in transit["lines"] for s in line["stops"] if s["id"] not in covered]
    missing += [line["id"] for line in transit["lines"] if line["id"] not in covered]
    return missing


def filed_as(save_as):
    """The repository file that already holds this prompt's picture (any image format), or None.

    The prompts ask for PNG; filed sprites are kept as WebP with transparency (art/README.md).
    """
    stem = (ROOT / save_as).with_suffix("")
    for ext in (".png", ".webp"):
        if stem.with_suffix(ext).exists():
            return str(stem.with_suffix(ext).relative_to(ROOT))
    return None


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="verify coverage and that the generated files are current; write nothing")
    args = ap.parse_args(argv)
    locations, properties, transit, city, sim = load_data()
    prompts = build_prompts(locations, properties, transit, city, sim)
    for p in prompts:
        p["filed"] = filed_as(p["save_as"])
    ids = [p["id"] for p in prompts]
    assert len(ids) == len(set(ids)), "duplicate prompt id"
    counts = {
        "locations": len(locations), "unit_locations": sum(1 for l in locations if l["type"] in UNIT_TYPES),
        "groups": sum(1 for p in prompts if p["section"] == "homes" and len(p["covers"]) > 1),
        "stops": sum(len(line["stops"]) for line in transit["lines"]), "lines": len(transit["lines"]),
        "construction": sum(1 for l in locations if l["type"] == "construction_site"), "tiles": len(TILES),
        "filed": sum(1 for p in prompts if p["filed"]),
    }
    md, page = render_markdown(prompts, counts), render_html(prompts, counts)
    missing = coverage(prompts, locations, transit)
    if args.check:
        problems = [f"no prompt for {m}" for m in missing]
        for path, text in ((MD_PATH, md), (HTML_PATH, page)):
            if not path.exists():
                problems.append(f"{path.relative_to(ROOT)} is missing")
            elif path.read_text(encoding="utf-8") != text:
                problems.append(f"{path.relative_to(ROOT)} is stale")
        if problems:
            for p in problems:
                print(f"town_prompts: {p}", file=sys.stderr)
            print(f"town_prompts: run python3 {SELF}", file=sys.stderr)
            return 1
        print(f"town_prompts: ok, {len(prompts)} prompts cover {counts['locations']} locations, {counts['stops']} stops, {counts['lines']} line")
        return 0
    if missing:
        print("town_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        return 1
    MD_PATH.write_text(md, encoding="utf-8")
    HTML_PATH.write_text(page, encoding="utf-8")
    print(f"town_prompts: wrote {MD_PATH.relative_to(ROOT)} and {HTML_PATH.relative_to(ROOT)} ({len(prompts)} prompts)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
