#!/usr/bin/env python3
"""Generates the character prompt pack from the game's data, so it never drifts from the cast.

Writes art/PROMPT_PACK_CHARACTERS.md (to read) and art/prompts_characters.html (to copy prompts from on
a phone): for every character in data/characters (founders, the four residents, the townspeople) a
prompt for a sheet of isometric game sprites of that person at the town's camera angle and golden-hour
light, built from their appearance and pointing at their model sheet as the reference; and for each
townsperson, who has no picture yet (D-073), a prompt for that model sheet first, in the layout of the
cast's sheets. Every prompt ends with the file name to save the picture as.

The map and the interiors draw people today with full-body cut-outs from the model sheets
(scripts/client_figures.py, web/client/figures.js): photographs seen from eye level, one view per
direction, no walk cycle and no seated pose. These sheets are what replaces them; see SPRITE_NOTES.

Usage: scripts/character_prompts.py            regenerate both files
       scripts/character_prompts.py --check    exit 1 if someone in data/characters has no prompt (a
                                               townsperson also needs a model sheet prompt), or if the
                                               generated files are stale

Everyone's look comes from data/characters/<id>.json (profile.appearance, profile.card).
"""
import argparse
import pathlib
import sys

sys.dont_write_bytecode = True  # importing town_prompts must not leave a __pycache__ in scripts/
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import town_prompts as tp  # noqa: E402  (shares the page's CSS and JS, the escaping and the filed check)

ROOT = tp.ROOT
DATA = tp.DATA
MD_PATH = ROOT / "art" / "PROMPT_PACK_CHARACTERS.md"
HTML_PATH = ROOT / "art" / "prompts_characters.html"
SELF = "scripts/character_prompts.py"
SIZE = "1536×1024"
CELL_PX, REF_CM, REF_PX = 341, 175, 300   # a 175 cm person stands 300 px tall in a 341 px cell

# ----------------------------------------------------------------------------------------------
# Style sheet. STYLE_SHORT is repeated at the top of every prompt so each one can be pasted alone.
# The camera and the light are the town sprites' (scripts/town_prompts.py, art/STYLE.md), so a person
# stands in the town like the buildings around them.
# ----------------------------------------------------------------------------------------------
STYLE_SHORT = (
    "LIVÉRA character sprite sheet for a 2.5D game. The same camera as the Livéra town sprites: isometric 2:1 (30°) "
    "view from the south-west, looking down at about 30°, so the person is seen from slightly above, exactly like the "
    "buildings they walk past. Warm golden-hour light from the west, the town's light: a soft champagne glow on skin and "
    "clothes, a warm rim light, soft shading; clean photoreal render with the realism of the reference photo, no "
    "outlines. Transparent background (PNG with alpha): no floor, no ground shadow, no scenery, no props except what "
    "the person carries below and the chair and the sofa, no text, no labels, no frame or grid lines. One person, the same in every pose: "
    "the same face, hair, skin tone, body, outfit and accessories, at the same scale in every cell, full body from the "
    "top of the head to the soles, nothing cropped. No logos or recognisable brands on clothes or shoes."
)

LAYOUT = (
    "Layout: a grid of 4 columns and 3 rows of equal cells on a {size} canvas, one figure centred in each cell, the feet "
    "of every figure in a row on the same baseline near the bottom of its cell. "
    "Row 1, a 4-frame walk cycle walking toward the lower left of the image (toward the camera's left, three-quarter "
    "front view): contact, down, passing, up. "
    "Row 2, a 4-frame walk cycle walking away toward the upper right of the image (away to the camera's right, "
    "three-quarter back view): the same four phases. "
    "Row 3: (1) standing idle, relaxed, three-quarter front, facing the lower left; (2) standing idle, three-quarter "
    "back, facing the upper right; (3) sitting on a simple armless oak chair (draw the chair), three-quarter front "
    "facing the lower left, feet on the floor, hands in the lap; (4) sitting on a deep emerald sofa (draw only the "
    "seat and back cushions under and behind them), three-quarter front facing the lower left, leaning back, relaxed. "
    "The game makes the other two walking directions by mirroring, so draw anything one-sided (a bag, a parting, a "
    "watch, a tattoo) only as it is; it will flip."
)

STYLE_SHEET = """\
Every prompt below repeats this in brief, so you can paste any single prompt on its own.

- **View.** The town sprites' camera: isometric 2:1 (30°) from the south-west, looking down at
  about 30°. People are seen from slightly above, as the buildings are, so they stand in the
  town instead of on it. The reference sheets are photographs from eye level; the sprites keep the
  person and change the camera.
- **Light.** Golden hour from the west, the same as every town sprite and interior: a soft
  champagne glow, a warm rim light, soft shading. The game darkens it for the night itself.
- **One sheet per person, 4 × 3 cells.** Row 1: a 4-frame walk toward the lower left (three-quarter
  front). Row 2: a 4-frame walk away toward the upper right (three-quarter back). Row 3: standing
  idle front and back, sitting on a chair, sitting on a sofa. The other two diagonals are the first
  two rows mirrored, which covers every street on the map (they all run at 30° on screen).
- **One scale for everyone.** A 175 cm person stands 300 px tall in a 341 px cell; each prompt
  gives that person's height in pixels from their height in the data. Full body, nothing cropped,
  feet on one baseline per row.
- **The same person in every cell.** Face, hair, skin tone, build, outfit and jewellery as in the
  data and the reference sheet; attach the sheet to the generator with the prompt.
- **Transparent background**, PNG, nothing but the person (and the chair and sofa in row 3). No
  ground shadow: the game draws its own under the feet.
- **No brands.** Plain shoes and watches. Where a reference sheet shows something that resembles a
  real product, the prompt says to draw it plain.
"""

HONESTY_NOTES = """\
- **The game draws the filed sheets' frames** (D-072: `scripts/client_figures.py` cuts them,
  `web/client/figures.js` draws them) on the map and in the rooms. People without a sheet are still
  drawn from their model sheet's cut-outs: one photograph per direction, scaled, with a bob for
  walking and a standing figure lowered into the seat for sitting.
- **The outfit is the data's.** Where a reference sheet shows another look (Dominique's turnaround
  is her weekend look, Dax's an all-black tee), the prompt asks for the outfit in the data; the
  sheet is for the face, hair, skin and build.
- **Everyone's look comes from their data** (`data/characters/<id>.json`, `profile.appearance`). The
  four residents (Kai Morgan, Rosa Delgado, Sol Rivera, Theo Grant) were made in the creator for the
  town-preview recording and are data characters since D-073; their facts were read off their sheets.
- **The townspeople have no picture yet.** Each has two prompts: a model sheet first (the same layout
  as the cast's: portrait, name card, two looks, four expressions, a four-view turnaround), then the
  sprite sheet, made with that model sheet attached. Until their art is filed the game draws them as a
  labelled stand-in in their work colours (`web/client/figures.js`).
- When a generated picture gets a fact wrong, say so (`art_notes` in their data, or `notes` in
  `art/manifest.json`), as the other art does. Nobody should mistake a picture for the game's state.
"""

SPRITE_NOTES = """\
A sheet replaces the cut-outs in three steps, all built (D-072):

1. **The sheet** (this pack): `art/sprites/characters/<id>/sheet.png`, 4 × 3 cells as above (filed
   as `sheet.webp`).
2. **The frames** (`scripts/client_figures.py` cuts the cells): `walk_front34_1` to `_4`,
   `walk_back34_1` to `_4`, `idle_front34`, `idle_back34`, `sit_chair`, `sit_sofa`, each cut out
   with the repository's BiRefNet matte, scaled like the cut-outs to 360 px for a 1.75 m person,
   anchored at the feet (sitting: the seat point, where the seat is under the hips), into
   `web/client/figures/<id>/` and its manifest. The chair and the sofa drawn in row 3 are taken out
   of the seated frames (the room's own seat is under the person), so draw them as asked: a simple
   cream chair on oak legs, a green velvet sofa.
3. **The client** (`web/client/figures.js`, same `drawFigure()` API): the walk frames for
   `pose: "walk"` by `phase`, the standing frames for standing, the seated frames for `pose: "sit"`
   on the seat (chair, stool and seat: `sit_chair`; sofa and bed: `sit_sofa`); mirrored for the other
   two diagonals. A seat that faces away from the camera still shows the standing back frame lowered
   onto it: the sheet has no seated frame from behind.

Fighting (fists up) and flinching are not in these sheets: today `pose: "fight"` and `"flinch"`
lean, crouch and bounce or shake the standing picture. A later sheet can ask for them, and for
sitting seen from behind.
"""

# A townsperson's model sheet, in the layout of the cast's sheets (art/reference/characters, art/reference/residents).
MODEL_DIR = "art/reference/townspeople"
MODEL_SIZE = "1536×1024"
MODEL_STYLE = (
    "LIVÉRA character model sheet, one landscape image laid out exactly like the cast's other sheets. Photoreal, the "
    "realism of a high-end editorial photo shoot; warm golden-hour light with soft bokeh in the scene panels; a deep "
    "black card panel with champagne-gold serif type. No logos or recognisable brands anywhere, no text except the "
    "card and the gold captions named below."
)
MODEL_LAYOUT = (
    "Layout on a {size} canvas, thin gold rules between panels: "
    "(1) top left, a large head-and-shoulders portrait in their everyday look, one hand near the face, the place they "
    "work softly out of focus behind them; "
    "(2) top centre, the name card: the first name in large spaced capitals, the last name below it, the title in small "
    "gold capitals, a thin gold rule, then label and value rows in this order: Age, Pronouns, Height, Occupation, "
    "Build, Skin Tone, Eye Color; then KEY FEATURES with small diamond bullets; then PERSONALITY with three diamond "
    "bullets; "
    "(3) top right, two scene panels side by side with gold captions underneath: WORK LOOK and {second}; "
    "(4) bottom left, four head-and-shoulders close-ups in the everyday look captioned NEUTRAL, SMILE, SERIOUS, "
    "THOUGHTFUL; "
    "(5) bottom right, a four-view full-body turnaround on a plain mid-grey studio background with even light, "
    "captioned FRONT, THREE-QUARTER, SIDE, BACK: the same outfit in all four views, the whole body from the top of "
    "the head to the soles, feet on one floor line, nothing cropped."
)


def model_sheet_of(ch):
    return f"{MODEL_DIR}/{ch['id']}.jpg"


def model_filed(save_as):
    stem = (ROOT / save_as).with_suffix("")
    for ext in (".jpg", ".png", ".webp"):
        if stem.with_suffix(ext).exists():
            return str(stem.with_suffix(ext).relative_to(ROOT))
    return None


SECTION_OF_CAST = {"founder": "founders", "resident": "residents", "townsperson": "townspeople"}


def cast():
    """Every playable character in data, with what the prompts need. Townspeople's reference is the model sheet the
    pack asks for first (art/reference/townspeople/<id>.jpg)."""
    out = []
    for f in sorted((DATA / "characters").glob("*.json")):
        for c in tp.load_json(f).get("characters", []):
            if not c.get("playable", False):
                continue
            p = c.get("profile", {})
            a = p.get("appearance", {})
            sheets = a.get("reference_sheets", {})
            kind = c.get("cast", "founder")
            ch = {"id": c["id"], "name": f"{c['first_name']} {c['last_name']}", "first": c["first_name"],
                  "last": c["last_name"], "age": c.get("age"), "pronouns": c.get("pronouns", ""),
                  "title": p.get("archetype", ""), "look": a, "cast": kind, "section": SECTION_OF_CAST.get(kind, "founders"),
                  "card": p.get("card", {}), "traits": c.get("traits", []), "schedule": p.get("schedule", {}),
                  "notes": a.get("art_notes", []), "data_file": f.relative_to(ROOT).as_posix(),
                  "sheet": sheets.get("turnaround") or a.get("visual_reference", "")}
            if kind == "townsperson" and not ch["sheet"]:
                ch["sheet"] = model_sheet_of(ch)
            out.append(ch)
    return out


def px_for(cm):
    return round(REF_PX * cm / REF_CM)


def signature(style):
    """The outfit to draw: the whole style, or its work look when the data gives several ("work: …; evening: …",
    "on duty: …; off duty: …")."""
    low = style.lower()
    if not (low.startswith("work:") or low.startswith("on duty:")):
        return style, None
    looks = [s.strip() for s in style.split(";")]
    return looks[0].split(":", 1)[1].strip(), "; ".join(looks[1:]) or None


def off_duty(ch):
    """Somewhere they go when they aren't working: their schedule's first line that isn't work or home."""
    for day in ("weekdays", "saturday", "sunday", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday"):
        for e in ch["schedule"].get(day, []):
            what = e.get("activity", "")
            if not e.get("work") and "home" not in what.lower():
                return what
    return "a walk in Founders Park"


def prompt_for(ch):
    a, sheet = dict(ch["look"]), ch["sheet"]
    other = None
    if a.get("style"):
        a["style"], other = signature(a["style"])
    cm = a.get("height_cm")
    if not cm:
        raise SystemExit(f"character_prompts: {ch['id']} has no height_cm")
    facts = [("Who", f"{ch['name']}, {ch['age']}, {ch['pronouns']}" + (f" · {ch['title']}" if ch["title"] else "")),
             ("Height", f"{cm} cm → {px_for(cm)} px tall in a {CELL_PX} px cell (175 cm = {REF_PX} px)")]
    for key, label in (("build", "Build"), ("skin", "Skin"), ("eyes", "Eyes"), ("face", "Face"), ("hair", "Hair"),
                       ("style", "Wearing"), ("jewelry", "Jewellery"), ("silhouette", "Silhouette")):
        if a.get(key):
            facts.append((label, a[key]))
    if other:
        facts.append(("Other look (not drawn)", other))
    if a.get("key_features"):
        facts.append(("Key features", "; ".join(a["key_features"])))
    facts.append(("Reference sheet", sheet + ("" if ch["cast"] != "townsperson" or model_filed(sheet)
                                             else " (not made yet: its prompt is in this pack)")))
    facts.append(("From", f"{ch['data_file']} (profile.appearance)"))
    for n in ch.get("notes", []):
        facts.append(("Art note", n))
    facts.append(("Art direction", "the camera, the light, the 4 × 3 layout, the chair and the sofa"))
    parts = [f"The person: {ch['name']}, {ch['age']} ({ch['pronouns']}), {cm} cm tall, {a.get('build', '')} build. "
             f"Draw them {px_for(cm)} px tall from the top of the head to the soles in every standing and walking cell "
             f"(a 175 cm person is {REF_PX} px), seated proportionally."]
    if a.get("skin"):
        parts.append(f"Skin: {a['skin']}.")
    if a.get("eyes"):
        parts.append(f"Eyes: {a['eyes']}.")
    if a.get("face"):
        parts.append(f"Face: {a['face']}.")
    if a.get("hair"):
        parts.append(f"Hair: {a['hair']}.")
    if a.get("style"):
        parts.append(f"Wearing, in every cell: {a['style']}.")
    if a.get("jewelry"):
        parts.append(f"Jewellery: {a['jewelry']}.")
    if a.get("silhouette"):
        parts.append(f"Silhouette: {a['silhouette']}.")
    if a.get("key_features"):
        parts.append("Keep these recognisable: " + "; ".join(k[0].lower() + k[1:] for k in a["key_features"]) + ".")
    parts.append(f"Reference: attach {sheet} and match the person in it (face, hair, skin tone, body); "
                 "the outfit is the one written here, even where the sheet shows another.")
    parts.append(LAYOUT.format(size=SIZE))
    save_as = f"art/sprites/characters/{ch['id']}/sheet.png"
    prompt = f"{STYLE_SHORT}\n\n{' '.join(parts)}\n\nSize {SIZE}, transparent background. Save as {save_as}"
    return {"id": ch["id"], "title": ch["name"], "section": ch["section"], "save_as": save_as, "size": SIZE,
            "facts": facts, "prompt": prompt, "filed": tp.filed_as(save_as)}


def model_prompt_for(ch):
    """A townsperson's model sheet, in the cast's layout, from their data (D-073)."""
    a, card = dict(ch["look"]), ch["card"]
    style, other = signature(a.get("style", ""))
    if other and ":" in other.split(";")[0]:
        other = other.split(":", 1)[1].strip()  # "off duty: a grey cardigan" -> the look itself
    work = card.get("occupation", "")
    workplace = work.split(", ", 1)[1] if ", " in work else work
    second_place = off_duty(ch)
    second = "OFF-DUTY LOOK"
    rows = [("Age", str(ch["age"])), ("Pronouns", ch["pronouns"]), ("Height", f"{card.get('height_cm', a.get('height_cm'))} cm"),
            ("Occupation", work), ("Build", card.get("build", a.get("build", ""))),
            ("Skin Tone", card.get("skin_tone", a.get("skin", ""))), ("Eye Color", a.get("eyes", ""))]
    personality = [t.replace("_", " ").capitalize() for t in ch["traits"][:3]]
    facts = [("Who", f"{ch['name']}, {ch['age']}, {ch['pronouns']} · {ch['title']}"),
             ("Card", "; ".join(f"{k}: {v}" for k, v in rows)),
             ("Key features", "; ".join(a.get("key_features", []))),
             ("Personality", ", ".join(personality)),
             ("Everyday look (portrait, close-ups, turnaround)", style),
             ("Work look", f"at {workplace}, doing the job" + (f"; {style}" if style else "")),
             ("Off-duty look", f"{second_place}" + (f"; {other}" if other else ""))]
    for key, label in (("face", "Face"), ("hair", "Hair"), ("jewelry", "Jewellery"), ("silhouette", "Silhouette")):
        if a.get(key):
            facts.append((label, a[key]))
    facts.append(("From", f"{ch['data_file']} (profile.card, profile.appearance, traits, schedule)"))
    card_text = (f"The card reads: '{ch['first'].upper()}' / '{ch['last'].upper()}' / '{ch['title'].upper()}'; "
                 + "; ".join(f"{k} — {v}" for k, v in rows)
                 + "; KEY FEATURES — " + "; ".join(a.get("key_features", []))
                 + "; PERSONALITY — " + ", ".join(personality) + ".")
    person = [f"The person: {ch['name']}, {ch['age']} ({ch['pronouns']}), {a.get('height_cm')} cm, "
              f"{a.get('build', '')} build."]
    for key, label in (("skin", "Skin"), ("eyes", "Eyes"), ("face", "Face"), ("hair", "Hair"), ("jewelry", "Jewellery")):
        if a.get(key):
            person.append(f"{label}: {a[key]}.")
    if style:
        person.append(f"Everyday look (portrait, close-ups and the turnaround): {style}.")
    person.append(f"WORK LOOK panel: at {workplace} in Livéra, mid-task, in that same outfit.")
    person.append(f"{second} panel: {second_place.rstrip('.')}" + (f", wearing {other}" if other else ", relaxed") + ".")
    person.append("The same face, hair, skin tone and body in every panel.")
    save_as = model_sheet_of(ch)
    prompt = (f"{MODEL_STYLE}\n\n{' '.join(person)}\n\n{card_text}\n\n{MODEL_LAYOUT.format(size=MODEL_SIZE, second=second)}"
              f"\n\nSize {MODEL_SIZE}. Save as {save_as}")
    return {"id": f"{ch['id']}-model", "title": ch["name"], "section": "models", "save_as": save_as, "size": MODEL_SIZE,
            "facts": facts, "prompt": prompt, "filed": model_filed(save_as)}


def build_all():
    people = cast()
    prompts = [model_prompt_for(c) for c in people if c["cast"] == "townsperson"]
    prompts += [prompt_for(c) for c in people]
    return people, prompts


SECTIONS = [("models", "Townspeople: model sheets (first)"), ("founders", "Founders"), ("residents", "Residents"),
            ("townspeople", "Townspeople: sprite sheets")]


def ordered(prompts, section):
    return sorted((p for p in prompts if p["section"] == section), key=lambda p: p["title"])


def summary(prompts, counts):
    return (f"{len(prompts)} prompts: a sprite sheet for each of {counts['founders']} founders, {counts['residents']} residents "
            f"and {counts['townspeople']} townspeople, and a model sheet for each townsperson ({counts['models']}), "
            f"to make first. {counts['filed']} of {len(prompts)} are filed.")


def render_markdown(prompts, counts):
    out = ["# LIVÉRA character prompt pack", "",
           f"Generated by `{SELF}` from `data/characters`. Do not edit by hand: rerun the script after changing the data, "
           f"and `python3 {SELF} --check` fails when this file is stale or someone in data has no prompt.", "",
           summary(prompts, counts) + " The phone page `art/prompts_characters.html` has the same prompts with a Copy "
           "button and a done checkbox.", "",
           "## How to use (on a phone)", "",
           "1. Open `art/prompts_characters.html` and tap **Copy** on a card. A townsperson's model sheet comes first: their "
           "sprite sheet is made with it attached.",
           "2. Paste into the image generator and attach the reference sheet named in the prompt (none for a model sheet). "
           "Each prompt already carries the style, the layout and the size.",
           "3. Check a model sheet's card against the facts, and that a sprite sheet is the same person in all twelve cells, "
           "seen from the town's angle, at the height the prompt gives, with nothing cropped and no background.",
           "4. Save the file under the name at the end of the prompt; link a model sheet from the character's data "
           "(`profile.appearance.visual_reference`) and a sprite sheet from `art/manifest.json` (`sprite_sheets`), with "
           "anything the picture gets wrong as a note.",
           "5. Tick **done** on the card. The page remembers it on that phone.", "",
           "## Style sheet", "", STYLE_SHEET, "## What these prompts are not", "", HONESTY_NOTES,
           "## How a sheet replaces the cut-outs", "", SPRITE_NOTES]
    for key, label in SECTIONS:
        out += [f"## {label}", ""]
        for p in ordered(prompts, key):
            out += [f"### {p['title']}" + (" (filed)" if p["filed"] else ""), "",
                    f"Save as `{p['save_as']}` · {p['size']}" + (f" · filed as `{p['filed']}`" if p["filed"] else ""), "",
                    "Facts:", ""]
            out += [f"- **{k}:** {v}" for k, v in p["facts"]]
            out += ["", "```text", p["prompt"], "```", ""]
    return "\n".join(out)


def render_html(prompts, counts):
    h = tp.esc
    js = tp.JS.replace("livera.prompts_town.", "livera.prompts_characters.")
    out = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           "<title>LIVÉRA character prompts</title>", f"<style>{tp.CSS}</style>", "</head>", "<body>", '<div class="wrap">',
           "<h1>LIVÉRA character prompts</h1>",
           f'<p class="lead">Generated by <code>{h(SELF)}</code> from the game\'s data. {h(summary(prompts, counts))} '
           "A sprite sheet is a walk cycle each way, standing, and sitting on a chair and a sofa, at the town's camera angle "
           "and golden-hour light. Tap Copy, paste into the image generator with the reference sheet attached, save under "
           "the name at the end, tick done.</p>",
           '<p class="lead"><strong>Not in the game yet:</strong> the map draws cut-outs from the model sheets today, and '
           "the townspeople as a labelled stand-in. These pictures replace them once they're made (see the style sheet "
           "below).</p>",
           '<div class="bar"><strong id="progress">0 done</strong><label><input type="checkbox" id="hide-done"> hide done</label></div>',
           "<nav>" + " ".join(f'<a href="#{h(key)}">{h(label)}</a>' for key, label in SECTIONS) + "</nav>",
           '<details class="style"><summary>Style sheet (already inside every prompt)</summary>',
           f"<pre>{h(STYLE_SHORT)}</pre>", "<ul>" + "".join(f"<li>{h(line)}</li>" for line in tp.md_bullets(STYLE_SHEET)) + "</ul>",
           "<p><strong>What these prompts are not</strong></p><ul>" + "".join(f"<li>{h(line)}</li>" for line in tp.md_bullets(HONESTY_NOTES)) + "</ul>",
           "<p><strong>How a sheet replaces the cut-outs</strong></p><ol>"
           + "".join(f"<li>{h(line)}</li>" for line in numbered(SPRITE_NOTES)) + "</ol>",
           "</details>"]
    for key, label in SECTIONS:
        out.append(f'<h2 id="{h(key)}">{h(label)}</h2>')
        for p in ordered(prompts, key):
            out.append(f'<article class="card" data-id="{h(p["id"])}"' + (' data-filed="1"' if p["filed"] else "") + ">")
            out.append(f"<h4>{h(p['title'])}" + (f' <span class="filed">Filed: {h(p["filed"])}</span>' if p["filed"] else "") + "</h4>")
            out.append(f'<p class="meta">Save as <code>{h(p["save_as"])}</code> · {h(p["size"])}</p>')
            out.append(f'<pre class="prompt">{h(p["prompt"])}</pre>')
            out.append('<div class="row"><button type="button" class="copy">Copy</button>'
                       '<label><input type="checkbox" class="done-box"> done</label></div>')
            out.append("<details><summary>Facts</summary><dl>"
                       + "".join(f"<dt>{h(k)}</dt><dd>{h(v)}</dd>" for k, v in p["facts"]) + "</dl></details>")
            out.append("</article>")
    out += ["<footer>No external resources. The done ticks live in this browser's localStorage only. "
            "When a picture gets a fact wrong, say so in a note beside its link.</footer>",
            "</div>", f"<script>{js}</script>", "</body>", "</html>", ""]
    return "\n".join(out)


def numbered(text):
    """The numbered items of a Markdown block, each on one line, without the number (bold and code marks removed)."""
    items, cur = [], None
    for line in text.splitlines():
        head = line.split(". ", 1)
        if len(head) == 2 and head[0].isdigit():
            if cur is not None:
                items.append(cur)
            cur = head[1].strip()
        elif cur is not None and line.strip():
            cur += " " + line.strip()
    if cur is not None:
        items.append(cur)
    return [i.replace("**", "").replace("`", "") for i in items]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="verify coverage and that the generated files are current; write nothing")
    args = ap.parse_args(argv)
    people, prompts = build_all()
    ids = [p["id"] for p in prompts]
    assert len(ids) == len(set(ids)), "duplicate prompt id"
    want = {c["id"] for c in people} | {f"{c['id']}-model" for c in people if c["cast"] == "townsperson"}
    missing = sorted(want - set(ids))
    counts = {key: sum(1 for p in prompts if p["section"] == key) for key in ("founders", "residents", "townspeople", "models")}
    counts["filed"] = sum(1 for p in prompts if p["filed"])
    md, page = render_markdown(prompts, counts), render_html(prompts, counts)
    if args.check:
        stale = [p for p, text in ((MD_PATH, md), (HTML_PATH, page)) if not p.exists() or p.read_text(encoding="utf-8") != text]
        for p in stale:
            print(f"character_prompts: {p.relative_to(ROOT)} is stale; run python3 {SELF}", file=sys.stderr)
        if missing:
            print("character_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        if stale or missing:
            return 1
        print(f"character_prompts: ok, {len(prompts)} prompts cover everyone in data/characters")
        return 0
    if missing:
        print("character_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        return 1
    MD_PATH.write_text(md, encoding="utf-8")
    HTML_PATH.write_text(page, encoding="utf-8")
    print(f"character_prompts: wrote {MD_PATH.relative_to(ROOT)} and {HTML_PATH.relative_to(ROOT)} ({len(prompts)} prompts)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
