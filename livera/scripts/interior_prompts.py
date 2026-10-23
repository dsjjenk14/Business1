#!/usr/bin/env python3
"""Generates the interior art prompt pack from the game's data, so it never drifts from the game.

Writes art/PROMPT_PACK_INTERIORS.md (to read) and art/prompts_interiors.html (to copy prompts from on a
phone): one image prompt per place a character can go inside, and one per home (homes that the data
describes the same way share a prompt), each ending with the file name to save the picture as.

The pictures are drawn to be rooms a character can later walk around and sit down in: one cutaway at
the town sprites' angle, to scale, with clear walkways, and with a piece of furniture for every
activity the place offers (a shower for "Take a shower", the sofa for "Nap on the sofa"). Walking
around inside and sitting are not in the game yet; see INSIDE_NOTES.

Usage: scripts/interior_prompts.py            regenerate both files
       scripts/interior_prompts.py --check    exit 1 if a place someone can enter has no prompt, or if
                                              the generated files are stale

What a place is, sells and lets you do comes from data/world and data/careers. Room sizes and the
look of each kind of room are written here and labelled "(art direction)" in the facts.
"""
import argparse
import pathlib
import re
import sys

sys.dont_write_bytecode = True  # importing town_prompts must not leave a __pycache__ in scripts/
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import town_prompts as tp  # noqa: E402  (shares the data loader, the page's CSS and JS, and the escaping)

ROOT = tp.ROOT
DATA = tp.DATA
MD_PATH = ROOT / "art" / "PROMPT_PACK_INTERIORS.md"
HTML_PATH = ROOT / "art" / "prompts_interiors.html"
SELF = "scripts/interior_prompts.py"
SIZE = "1536×1024"

# ----------------------------------------------------------------------------------------------
# Style sheet. STYLE_SHORT is repeated at the top of every prompt so each one can be pasted alone.
# The camera is the town sprites' (isometric 2:1 from the south-west), cut away like a dollhouse so
# the floor, every seat and every bed are in view; the light and palette are art/STYLE.md's, with
# the law-office reference (black marble, gold, warm lamps) kept for the places that are named as
# luxurious.
# ----------------------------------------------------------------------------------------------
STYLE_SHORT = (
    "LIVÉRA interior. Isometric 2:1 (30°) cutaway view from the south-west, the same camera as the Livéra town "
    "sprites: the floor and the two far walls (north and east) are shown; the near walls and the ceiling are "
    "removed, and inside walls are cut down to waist height, so every room, seat and bed is in view. Warm "
    "golden-hour light through the windows and warm lamps, clean photoreal render, no outlines. The Livéra palette: "
    "ivory and sand plaster, warm oak, champagne-gold fittings and trim, deep emerald upholstery and accents, sage-green "
    "plants; black marble only where named. Through the windows only a soft golden-hour sky and trees (and anything "
    "the description below names), never a city skyline. Transparent background outside the room. Empty: no people, "
    "no pets, no text except a sign named below; screens, menu boards and posters blank or illegible. Drawn to scale "
    "for a game: a door is 2.1 m tall and a chair seat 0.45 m high; the floor is flat and even, with clear walkways at "
    "least 1 m wide from the entrance to every seat, bed and counter; nothing stands along the open front edge of the "
    "floor; every seat faces into the room and is fully visible, never hidden behind other furniture."
)

STYLE_SHEET = """\
Every prompt below repeats this in brief, so you can paste any single prompt on its own.

- **View.** The town sprites' camera: isometric 2:1 (30°) from the south-west. The room is cut
  away like a dollhouse: the floor and the two far walls (north and east) are drawn, the near
  walls and the ceiling are left out, and inside walls stop at waist height. That is the view a
  character will be walked around in, so it must be the same in every picture.
- **To scale, with room to walk.** A door is 2.1 m tall, a chair seat 0.45 m high, a bed 2 m
  long. Each prompt gives the room's size in metres. The floor is flat and even, the walkways are
  at least 1 m wide, and nothing stands along the open front edge of the floor, so the game can
  draw people on the floor in front of the furniture.
- **Every seat in view.** Chairs, sofas, stools, beds and pews face into the room and are never
  hidden behind other furniture: each one is a place a character will sit or lie down.
- **A spot for every activity.** Each prompt lists what a character can do in that place (from the
  game's data) and the piece of the room it happens at. Those pieces must be in the picture.
- **Light.** Golden hour through the windows (warm, low sun from the west) and warm lamps; the
  same light in every interior, like the town.
- **Palette (art/STYLE.md).** Ivory and sand plaster (#f7ecd6, #f0dec2, #d9c9a9), warm oak,
  champagne gold for fittings and trim (#dabb85), deep emerald for upholstery, doors and accents
  (#0b2b23), sage-green plants (#939c87). Black marble and gold (the law-office reference) only
  where a prompt names it. Exposed brick only where the description says so.
- **Windows.** Only sky, trees and what the place's own description names (cranes, the river, the
  lake). Never a skyline: the founding town has no towers but the ones on the map.
- **Empty and wordless.** No people, no pets, no animals except where the place is about them
  (the shelter's kennels stay empty too), no text except a sign the prompt names. Screens, menu
  boards and posters are blank or illegible.
- **Transparent background** outside the room, PNG, at the size given.
"""

HONESTY_NOTES = """\
- **Walking around inside and sitting work only in rooms whose data is traced** (`data/interiors/`,
  D-066). Elsewhere a character who enters a place is inside it without a position in a room, and
  the web client shows the scene card. A picture becomes a room as described in "How a picture
  becomes a room you can walk in".
- **Room sizes and furnishings beyond the description are art direction**, written in this
  script, not facts from the game. The facts under each prompt say which is which.
- **Pictures show no people.** Who works or lives somewhere is listed as a fact, so the room suits
  them, but they are drawn by the game, not into the picture.
- When a generated picture gets a fact wrong, say so in `art/manifest.json` under `notes`, as the
  other art does. Nobody should mistake a picture for the game's state.
"""

INSIDE_NOTES = """\
Each picture becomes one room in three steps (D-066). The rules are built; a place gets its room
once its picture has data in `data/interiors/`.

1. **The picture** (this pack): one cutaway room at the town's camera angle, to scale, with a piece
   of furniture for every activity and clear floor between them.
2. **The room's data** (`data/interiors/<id>.json`, checked by `ContentDatabase` like the rest of
   the content; the format is in `docs/DATA_MODEL.md`): the walkable floor traced from the picture,
   the furniture standing on it, and its spots, each a seat, bed, counter, stage or fixture with
   its position, the way a character faces there, and the activity it serves (`nap` → the sofa,
   `shower` → the shower, a shop's offers → its counter). Then `scripts/client_rooms.py` makes the
   web client's copy of the picture.
3. **The rules** (in `World`, like every other change of state): moving to a point inside, taking
   a spot and leaving it (`move_inside`, `sit`, `stand`). The server decides who sits where, so two
   people can't take the same chair, and an activity is done at its spot. Clients draw the room
   from the picture and each person at their place in it.
"""

# ----------------------------------------------------------------------------------------------
# Art direction by kind of place: (width × depth in metres, what the room holds, where staff work).
# The size is the cutaway's floor; the rest is how the description becomes a room people use.
# ----------------------------------------------------------------------------------------------
ROOMS = {
    "coffee_shop": ((14, 10), "the long communal table with about ten chairs, a few small tables by the window, a counter with the espresso machine and a pastry case", "behind the counter: the espresso machine, the till and the pastry case"),
    "restaurant": ((14, 11), "about eight candlelit tables for two and four, a small bar with the wine wall behind it", "a kitchen pass at the back and a host stand by the door"),
    "bar": ((16, 10), "the long bar with about ten stools, a few booths and high tables", "behind the bar: taps, bottles on lit shelves, glass racks"),
    "nightclub": ((18, 14), "a dance floor in front of a DJ booth with a big sound system, a long bar with stools, velvet booths along the walls; black marble and gold", "behind the bar and in the DJ booth"),
    "cinema": ((16, 12), "the lobby with the concession counter and the popcorn machine, and through an open archway one screening room with rows of red velvet seats facing a blank screen", "behind the concession counter"),
    "grocery": ((18, 13), "aisles of shelves wide enough to walk between, a produce stand, a cold case, and two checkout lanes", "at the checkout lanes and the stock shelves"),
    "clothing_store": ((14, 10), "racks of clothes, folding tables, the mirror wall, two fitting rooms with curtains, a bench, a sale bin by the door", "at the cash desk"),
    "electronics_store": ((14, 10), "white tables with demo laptops, the wall of headphones, a service counter", "at the service counter"),
    "jeweler": ((10, 8), "glass display cases in a U, two upholstered chairs at a velvet-topped counter for the serious customer; black marble and gold", "behind the glass cases"),
    "boutique": ((12, 9), "the showroom rail of finished pieces, mood boards on the wall, a cutting table and a dress form, a small sofa for clients", "at the cutting table and the design desk"),
    "pharmacy": ((14, 10), "aisles of shelves, the prescription counter at the back with a small waiting bench", "behind the prescription counter"),
    "salon": ((12, 9), "three barber chairs facing mirrors, a hair-wash basin, the nail station with two chairs, a waiting bench", "at the chairs, the basin and the nail station"),
    "laundromat": ((12, 9), "rows of front-loading washers and stacked dryers, a folding table, the change machine, one long bench", "none: self-service"),
    "gym": ((18, 12), "free weights and benches, a row of treadmills, a spin room behind glass with bikes, the smoothie bar with stools", "at the front desk and the smoothie bar"),
    "wellness_studio": ((12, 10), "the therapy room with two deep leather chairs facing each other and warm lamps, a small waiting area, stairs up to the yoga room (the yoga room itself may be left out)", "in the therapy room"),
    "recording_studio": ((12, 10), "the control room with the vintage console and monitors, the wall of synths, the couch, and through glass a small live room with a mic stand", "at the console"),
    "community_center": ((16, 12), "long dinner tables with benches, a serving counter from the kitchen, a corner with tutoring tables and bookshelves, the noticeboard", "at the serving counter and an office desk"),
    "church": ((16, 12), "rows of wooden pews facing a raised pulpit, choir seats beside it, and a door to the kitchen", "at the pulpit"),
    "clinic": ((14, 10), "a reception desk, a waiting room with chairs, and two exam rooms with exam tables", "at the reception desk and in the exam rooms"),
    "hospital": ((20, 14), "the emergency entrance and reception, a waiting room with chairs, treatment bays with beds behind curtains, and a ward room with beds", "at the reception, the nurses' station and the treatment bays"),
    "vet": ((12, 9), "a reception desk, a waiting room with chairs, an exam room with a steel exam table", "at the reception and the exam table"),
    "animal_shelter": ((14, 10), "a reception desk, rows of empty kennels and cat condos, a play area with a low fence and benches", "at the reception and by the kennels"),
    "office": ((16, 11), "an open floor of desks with chairs, a glass meeting room with a table, a reception desk, a lounge corner with a sofa", "at the desks"),
    "tech_office": ((16, 11), "standing desks with monitors, the whiteboard wall, a cold-brew tap, a lounge corner with beanbags and a sofa", "at the standing desks"),
    "newsroom": ((12, 9), "four desks with chairs, the police scanner on a shelf, the corkboard of red string, a sofa", "at the four desks"),
    "event_agency": ((12, 9), "desks with chairs, walls of swatches and seating charts, a client table with chairs", "at the desks and the client table"),
    "creative_agency": ((16, 11), "an open creative floor of desks with big screens, pin-up walls, a client meeting table, a lounge sofa", "at the desks"),
    "law_firm": ((16, 11), "the glass conference room with a long table and chairs, partners' offices with desks, the library of statute books with reading chairs, a reception desk; black marble and gold, warm lamps", "at the desks and the conference table"),
    "construction_office": ((10, 7), "two stacked site trailers cut open: downstairs the plan table with stools and a whiteboard of every build, upstairs desks (an outside stair joins them)", "at the plan table and the desks"),
    "civic": ((16, 11), "the front desk, a waiting bench, three holding cells with benches, a small office of desks, the academy classroom in back with desks", "at the front desk and the desks"),
    "courthouse": ((16, 12), "one courtroom: the judge's raised oak bench against the far wall with a high-backed chair behind it, a witness box beside the bench, the clerk's desk below it, a dock with a bench for the accused, two counsel tables with chairs facing the bench, and three rows of public benches behind a low oak rail", "at the judge's bench and the clerk's desk"),
    "university": ((20, 14), "one lecture hall with rising rows of seats facing a lectern, and the library with reading tables, chairs and shelves", "at the lectern"),
    "school": ((20, 14), "a classroom with small desks and chairs facing a teacher's desk and board, and the gym that doubles as the auditorium, with a stage at one end and folding chairs", "at the teacher's desk"),
    "daycare": ((14, 10), "a bright play room with soft mats, low tables and tiny chairs, cribs in a nap corner, a changing table, stairs up to the nanny office", "by the play mats and the cribs"),
    "clubhouse": ((14, 10), "the locker room with benches and showers, the trophy shelf (empty), and stairs up to the league office", "in the league office"),
}

# Homes: the rooms a home has. Bedrooms come from the data (property, or the description).
HOME_LOOK = {
    "apartment": ("a modern apartment", ""),
    "condo": ("a new condo", ""),
    "house": ("a detached family house", " Show both floors in the one cutaway, the upstairs rooms beside the downstairs ones like a split-level dollhouse."),
    "townhouse": ("a narrow townhouse", " Show its floors side by side in the one cutaway, like a split-level dollhouse."),
}

# What each activity needs in the room. A label can name the furniture itself ("Nap on the sofa").
SPOTS = {
    "shower": "a shower",
    "toilet": "a toilet in the bathroom",
    "restroom": "a restroom door at the back (the restroom need not be shown)",
    "brush_teeth": "a bathroom sink with a mirror",
    "groom": "a vanity mirror with good light",
    "cook": "a kitchen: a stove, a counter and a fridge",
    "watch_tv": "a TV facing the sofa",
    "game": "a games console by the TV",
    "take_out_trash": "a kitchen bin",
    "read": "a chair by the window for reading",
    "library": "the library's reading tables and chairs among the shelves",
    "darts": "a dartboard on a wall with clear floor in front of it",
    "community_dinner": "long dinner tables with benches",
    "volunteer": "a back table where volunteers sort donations",
    "locker_shower": "the locker room's lockers, benches and showers",
    "service": "the pews facing the pulpit",
    "visit_animals": "the kennels and the fenced play area with benches",
    "waiting_room": "waiting-room chairs",
    "people_watch": "a seat by the window",
}
NO_SPOT = {"clean_home"}  # done all over the home, not at one piece of furniture
NAP_SPOTS = (("sofa", "the sofa (long enough to lie on)"), ("couch", "the couch (long enough to lie on)"),
             ("reading chair", "a deep reading chair"))

GROUP_TITLES = {"willow_lane": "Willow Lane houses", "lakeview": "Lakeview condos", "maple_court": "Maple Court apartments",
                "lexington": "The Lexington apartments"}
OUTSIDE_TYPES = {"park", "construction_site", "street_corner", "sports_field", "sports_court", "apartment_building"}
HOME_TYPES = set(HOME_LOOK)
NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4}


def can_enter(loc):
    return loc["type"] not in OUTSIDE_TYPES and loc.get("enterable", True) is not False


def spot_for(act):
    if act["id"] in NO_SPOT:
        return None
    if act["id"] == "nap":
        label = act["label"].lower()
        for word, spot in NAP_SPOTS:
            if word in label:
                return spot
        return "the sofa (long enough to lie on)"
    if act["id"] == "shower" and "bath" in act["label"].lower():
        return "a bathtub"
    return SPOTS.get(act["id"])


def bedrooms_of(loc, prop):
    if prop and prop.get("bedrooms"):
        return prop["bedrooms"], "data"
    d = loc.get("description", "").lower()
    m = re.search(r"\b(one|two|three|four)[- ]bedroom", d) or re.search(r"\b(one|two|three|four) bedrooms\b", d)
    if m:
        return NUMBERS[m.group(1)], "description"
    if "loft" in d or loc["id"].startswith("riverside_lofts"):
        return 0, "loft"
    return 1, "art direction"


def residents_by_home():
    out = {}
    for f in sorted((DATA / "characters").glob("*.json")):
        d = tp.load_json(f)
        for c in d.get("characters", [d] if "id" in d else []):
            home = (c.get("home") or {}).get("property")
            if home:
                out.setdefault(home, []).append(f"{c.get('first_name', c['id'])} {c.get('last_name', '')}".strip())
    return out


def careers_by_place():
    out = {}
    for f in sorted((DATA / "careers").glob("*.json")):
        for c in tp.load_json(f).get("careers", []):
            for w in c.get("workplaces", []):
                out.setdefault(w, []).append(c)
    return out


def join_list(items):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def unique(seq):
    seen, out = set(), []
    for s in seq:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def place_prompt(loc, careers, type_names):
    kind = type_names.get(loc["type"], loc["type"].replace("_", " "))
    (w, d), holds, staff = ROOMS[loc["type"]]
    acts = loc.get("activities", [])
    spots = unique(spot_for(a) for a in acts)
    offers = [o["label"] for o in loc.get("offers", [])]
    facts = [("Name", loc["name"]), ("Id", loc["id"]), ("Type", kind), ("District", loc.get("district", "")),
             ("Description", loc.get("description", ""))]
    if acts:
        facts.append(("What a character can do here", "; ".join(f"{a['label']} ({a['id']})" for a in acts)))
    if offers:
        facts.append(("Sold or provided here", "; ".join(f"{o['label']} ({tp.money(o['price_cents'])})" for o in loc["offers"])))
    jobs = careers.get(loc["id"], [])
    if jobs:
        facts.append(("Jobs here", "; ".join(f"{c['name']}: " + ", ".join(l["title"] for l in c.get("levels", [])) for c in jobs)))
    if loc.get("stage"):
        facts.append(("Stage", "yes: performers can play here"))
    if loc.get("weddings"):
        facts.append(("Weddings", "yes"))
    if loc.get("access"):
        facts.append(("Access", loc["access"]))
    facts.append(("Room (art direction)", f"about {w} × {d} m: {holds}"))
    facts.append(("Source", loc["_file"]))

    parts = [f"{loc['name']}: the inside of {tp.article(kind)} in the {loc.get('district', 'town')} district. "
             f"The game describes it: \"{loc.get('description', '')}\"",
             f"Draw it as one cutaway room of about {w} × {d} metres holding {holds} (art direction)."]
    if spots:
        parts.append("It must also show, because these are what a character can do here: " + join_list(spots) + ".")
    if offers:
        shown = offers[:8]
        more = f" and {len(offers) - len(shown)} more" if len(offers) > len(shown) else ""
        parts.append(f"What it sells or provides ({join_list(shown)}{more}) is on display or at a counter a customer can walk up to.")
    if jobs and staff != "none: self-service":
        parts.append(f"Where the staff work: {staff} (the game's jobs here: {join_list(c['name'] for c in jobs)}).")
    if loc.get("stage"):
        parts.append("A small stage or performance corner with a mic stand, clear floor in front of it: performers can play here.")
    if loc.get("weddings"):
        parts.append("Room for a wedding: a clear aisle to the front.")
    if loc.get("access") == "staff":
        parts.append("It is a workplace (staff only): no shop counter.")
    parts.append("No people. No text anywhere in the image.")
    return {"id": loc["id"], "title": loc["name"], "section": "places", "district": loc.get("district", ""),
            "covers": [loc["id"]], "save_as": f"art/interiors/{loc['id']}.png", "facts": facts,
            "prompt": finish(" ".join(parts), f"art/interiors/{loc['id']}.png")}


def home_key(loc, prop):
    return (loc["type"], loc.get("description", ""), tuple(a["id"] for a in loc.get("activities", [])),
            bedrooms_of(loc, prop)[0], tuple((prop or {}).get("amenities", [])))


def home_prompt(locs, props, residents):
    loc = locs[0]
    prop = props.get(loc["id"])
    ids = [l["id"] for l in locs]
    prefix = ids[0].rsplit("_", 1)[0] if len(ids) > 1 else ids[0]
    stem = prefix + "_" + "_".join(i.rsplit("_", 1)[1] for i in ids) if len(ids) > 1 else ids[0]
    if len(ids) > 1:
        title = f"{GROUP_TITLES.get(prefix, prefix.replace('_', ' ').title())} ({', '.join(l['name'].split(', ')[-1] for l in locs)})"
    else:
        title = loc["name"]
    beds, beds_from = bedrooms_of(loc, prop)
    amenities = (prop or {}).get("amenities", [])
    acts = loc.get("activities", [])
    spots = unique(spot_for(a) for a in acts)
    look, levels = HOME_LOOK[loc["type"]]
    if beds == 0:
        rooms = "one open loft: a sleeping area with a bed, a living area, an open kitchen, and a bathroom behind a waist-high wall"
        size = (14, 10)
    else:
        words = {2: "two", 3: "three", 4: "four"}
        bedroom_words = "one bedroom with a double bed" if beds == 1 else f"{words.get(beds, beds)} bedrooms, each with a bed"
        rooms = f"an entry, a living room, a kitchen, {bedroom_words}, and a bathroom"
        size = {1: (11, 8), 2: (13, 9), 3: (15, 11)}.get(beds, (16, 12))
    if "in_unit_laundry" in amenities:
        rooms += ", and a laundry nook with a washer and dryer"
    outside = [a for a in amenities if a in ("back_yard", "porch", "garage", "balcony", "terrace")]
    who = [r for i in ids for r in residents.get(i, [])]
    facts = [("Homes", "; ".join(f"{l['name']} ({l['id']})" for l in locs)), ("Type", loc["type"]),
             ("District", loc.get("district", "")), ("Description", loc.get("description", "")),
             ("Bedrooms", f"{beds if beds else 'open loft'} (from the {beds_from})")]
    if amenities:
        facts.append(("Amenities", ", ".join(a.replace("_", " ") for a in amenities)))
    if acts:
        facts.append(("What a character can do here", "; ".join(f"{a['label']} ({a['id']})" for a in acts)))
    if who:
        facts.append(("Who lives here at the start", ", ".join(who)))
    if prop:
        facts.append(("For sale", f"{'yes' if prop.get('for_sale') else 'no'}, valued at {tp.money(prop['market_value_cents'])}"))
    facts.append(("Rooms (art direction)", f"about {size[0]} × {size[1]} m: {rooms}"))
    facts.append(("Source", loc["_file"]))

    shared = (f" The same picture serves {len(ids)} homes the game describes the same way, so give it nothing personal."
              if len(ids) > 1 else "")
    parts = [f"{title}: the inside of {look} in the {loc.get('district', 'town')} district. "
             f"The game describes it: \"{loc.get('description', '')}\"{shared}",
             f"Draw the whole home as one cutaway of about {size[0]} × {size[1]} metres: {rooms} (art direction).{levels}",
             "Characters sleep at home, so every bed is made and fully in view."]
    if spots:
        parts.append("It must also show, because these are what a character can do here: " + join_list(spots) + ".")
    if outside:
        parts.append("A door or window onto the " + join_list(a.replace("_", " ") for a in outside) + ", seen only at the edge.")
    parts.append("No people. No text anywhere in the image.")
    save_as = f"art/interiors/{stem}.png"
    return {"id": stem, "title": title, "section": "homes", "district": loc.get("district", ""), "covers": ids,
            "save_as": save_as, "facts": facts, "prompt": finish(" ".join(parts), save_as)}


def finish(body, save_as):
    return f"{STYLE_SHORT}\n\n{body}\n\nSize {SIZE}, transparent background. Save as {save_as}"


def build_prompts(locations, properties):
    careers = careers_by_place()
    residents = residents_by_home()
    type_names = dict(tp.TYPE_NAMES)
    prompts, homes = [], {}
    for loc in locations:
        if not can_enter(loc):
            continue
        if loc["type"] in HOME_TYPES:
            homes.setdefault(home_key(loc, properties.get(loc["id"])), []).append(loc)
            continue
        if loc["type"] not in ROOMS:
            raise SystemExit(f"interior_prompts: no room direction for type {loc['type']} ({loc['id']}); add it to ROOMS")
        prompts.append(place_prompt(loc, careers, type_names))
    for locs in homes.values():
        prompts.append(home_prompt(locs, properties, residents))
    return prompts


SECTIONS = [("places", "Places"), ("homes", "Homes")]


def ordered(prompts, section):
    return sorted((p for p in prompts if p["section"] == section), key=lambda p: (p["district"], p["title"]))


def render_markdown(prompts, counts):
    out = ["# LIVÉRA interior art prompt pack", "",
           f"Generated by `{SELF}` from `data/world`, `data/careers` and `data/characters`. Do not edit by hand: rerun the "
           f"script after changing the data, and `python3 {SELF} --check` fails when this file is stale or a place someone "
           "can enter has no prompt.", "",
           f"{len(prompts)} prompts: {counts['places']} places you can go inside and {counts['homes']} homes "
           f"({counts['home_locations']} home places; homes the data describes the same way share one picture). "
           "The phone page `art/prompts_interiors.html` has the same prompts with a Copy button and a done checkbox.", "",
           "## How to use (on a phone)", "",
           "1. Open `art/prompts_interiors.html` and tap **Copy** on a card.",
           "2. Paste into the image generator. Each prompt already carries the style sheet, the size and the transparent background.",
           "3. Check that the room is cut away at the same angle as the town sprites, that nobody is in it, that every "
           "listed piece of furniture is there, and that the seats and beds are all in view.",
           "4. Save the file under the name at the end of the prompt and add it to `art/manifest.json` under `interiors`, "
           "with anything the picture gets wrong under `notes`.",
           "5. Tick **done** on the card. The page remembers it on that phone.", "",
           "## Style sheet", "", STYLE_SHEET, "## What these prompts are not", "", HONESTY_NOTES,
           "## How a picture becomes a room you can walk in", "", INSIDE_NOTES]
    for key, label in SECTIONS:
        items = ordered(prompts, key)
        out += [f"## {label}", ""]
        district = None
        for p in items:
            if p["district"] and p["district"] != district:
                district = p["district"]
                out += [f"### {district}", ""]
            out += [f"#### {p['title']}" + (" (filed)" if p["filed"] else ""), "",
                    f"Save as `{p['save_as']}` · {SIZE}" + (f" · filed as `{p['filed']}`" if p["filed"] else ""), "",
                    "Facts from the data:", ""]
            out += [f"- **{k}:** {v}" for k, v in p["facts"]]
            out += ["", "```text", p["prompt"], "```", ""]
    return "\n".join(out)


def render_html(prompts, counts):
    h = tp.esc
    js = tp.JS.replace("livera.prompts_town.", "livera.prompts_interiors.")
    out = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           "<title>LIVÉRA interior prompts</title>", f"<style>{tp.CSS}</style>", "</head>", "<body>", '<div class="wrap">',
           "<h1>LIVÉRA interior prompts</h1>",
           f'<p class="lead">{len(prompts)} prompts generated by <code>{h(SELF)}</code> from the game\'s data: '
           f"{counts['places']} places you can go inside and {counts['homes']} homes. Each room is drawn to scale at the town's "
           "camera angle, cut away so every seat and bed is in view, with a piece of furniture for everything a character can do "
           "there. Tap Copy, paste into the image generator, save under the name at the end, tick done.</p>",
           '<p class="lead"><strong>Not in the game yet:</strong> walking around inside and sitting down. These pictures come first; '
           "the rooms are built from them (see the style sheet below).</p>",
           '<div class="bar"><strong id="progress">0 done</strong><label><input type="checkbox" id="hide-done"> hide done</label></div>',
           "<nav>" + " ".join(f'<a href="#{h(key)}">{h(label)}</a>' for key, label in SECTIONS) + "</nav>",
           '<details class="style"><summary>Style sheet (already inside every prompt)</summary>',
           f"<pre>{h(STYLE_SHORT)}</pre>", "<ul>" + "".join(f"<li>{h(line)}</li>" for line in tp.md_bullets(STYLE_SHEET)) + "</ul>",
           "<p><strong>What these prompts are not</strong></p><ul>" + "".join(f"<li>{h(line)}</li>" for line in tp.md_bullets(HONESTY_NOTES)) + "</ul>",
           "<p><strong>How a picture becomes a room you can walk in</strong></p><ol>"
           + "".join(f"<li>{h(re.sub(r'^[0-9]+[.] ', '', line))}</li>" for line in numbered(INSIDE_NOTES)) + "</ol>",
           "</details>"]
    for key, label in SECTIONS:
        out.append(f'<h2 id="{h(key)}">{h(label)}</h2>')
        district = None
        for p in ordered(prompts, key):
            if p["district"] and p["district"] != district:
                district = p["district"]
                out.append(f"<h3>{h(district)}</h3>")
            out.append(f'<article class="card" data-id="{h(p["id"])}"' + (' data-filed="1"' if p["filed"] else "") + ">")
            out.append(f"<h4>{h(p['title'])}" + (f' <span class="filed">Filed: {h(p["filed"])}</span>' if p["filed"] else "") + "</h4>")
            out.append(f'<p class="meta">Save as <code>{h(p["save_as"])}</code> · {h(SIZE)}</p>')
            out.append(f'<pre class="prompt">{h(p["prompt"])}</pre>')
            out.append('<div class="row"><button type="button" class="copy">Copy</button>'
                       '<label><input type="checkbox" class="done-box"> done</label></div>')
            out.append("<details><summary>Facts from the data</summary><dl>"
                       + "".join(f"<dt>{h(k)}</dt><dd>{h(v)}</dd>" for k, v in p["facts"]) + "</dl></details>")
            out.append("</article>")
    out += ["<footer>No external resources. The done ticks live in this browser's localStorage only. "
            "When a picture gets a fact wrong, say so in art/manifest.json under notes.</footer>",
            "</div>", f"<script>{js}</script>", "</body>", "</html>", ""]
    return "\n".join(out)


def numbered(text):
    """The numbered items of a Markdown block, each joined onto one line (bold and code marks removed)."""
    items, cur = [], None
    for line in text.splitlines():
        if re.match(r"^[0-9]+[.] ", line):
            if cur is not None:
                items.append(cur)
            cur = line.strip()
        elif cur is not None and line.strip():
            cur += " " + line.strip()
    if cur is not None:
        items.append(cur)
    return [i.replace("**", "").replace("`", "") for i in items]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="verify coverage and that the generated files are current; write nothing")
    args = ap.parse_args(argv)
    locations, properties, _transit, _city, _sim = tp.load_data()
    prompts = build_prompts(locations, properties)
    for p in prompts:
        p["filed"] = tp.filed_as(p["save_as"])
    ids = [p["id"] for p in prompts]
    assert len(ids) == len(set(ids)), "duplicate prompt id"
    covered = {c for p in prompts for c in p["covers"]}
    missing = [l["id"] for l in locations if can_enter(l) and l["id"] not in covered]
    counts = {"places": sum(1 for p in prompts if p["section"] == "places"),
              "homes": sum(1 for p in prompts if p["section"] == "homes"),
              "home_locations": sum(len(p["covers"]) for p in prompts if p["section"] == "homes")}
    md, page = render_markdown(prompts, counts), render_html(prompts, counts)
    if args.check:
        stale = [p for p, text in ((MD_PATH, md), (HTML_PATH, page))
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        for p in stale:
            print(f"interior_prompts: {p.relative_to(ROOT)} is stale; run python3 {SELF}", file=sys.stderr)
        if missing:
            print("interior_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        if stale or missing:
            return 1
        print(f"interior_prompts: ok, {len(prompts)} prompts cover {len(covered)} places you can go inside")
        return 0
    if missing:
        print("interior_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        return 1
    MD_PATH.write_text(md, encoding="utf-8")
    HTML_PATH.write_text(page, encoding="utf-8")
    print(f"interior_prompts: wrote {MD_PATH.relative_to(ROOT)} and {HTML_PATH.relative_to(ROOT)} ({len(prompts)} prompts)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
