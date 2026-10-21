#!/usr/bin/env python3
"""Generates the character sprite prompt pack from the game's data, so it never drifts from the cast.

Writes art/PROMPT_PACK_CHARACTERS.md (to read) and art/prompts_characters.html (to copy prompts from on
a phone): one image prompt per founder (data/characters) and per named resident (art/manifest.json
`residents`), each asking for a sheet of isometric game sprites of that person at the town's camera
angle and golden-hour light, built from their appearance and pointing at their model sheet as the
reference, and ending with the file name to save the sheet as.

The map and the interiors draw people today with full-body cut-outs from the model sheets
(scripts/client_figures.py, web/client/figures.js): photographs seen from eye level, one view per
direction, no walk cycle and no seated pose. These sheets are what replaces them; see SPRITE_NOTES.

Usage: scripts/character_prompts.py            regenerate both files
       scripts/character_prompts.py --check    exit 1 if a founder or named resident has no prompt, or
                                               if the generated files are stale

A founder's look comes from data/characters/<id>.json (profile.appearance). The created residents live
only in a save (D-044), so their look is read off their sheets' name cards and turnarounds and written
here (RESIDENTS), marked "(from the sheet)" in the facts.
"""
import argparse
import json
import pathlib
import sys

sys.dont_write_bytecode = True  # importing town_prompts must not leave a __pycache__ in scripts/
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import town_prompts as tp  # noqa: E402  (shares the page's CSS and JS, the escaping and the filed check)

ROOT = tp.ROOT
DATA = tp.DATA
MD_PATH = ROOT / "art" / "PROMPT_PACK_CHARACTERS.md"
HTML_PATH = ROOT / "art" / "prompts_characters.html"
MANIFEST = ROOT / "art" / "manifest.json"
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
- **The map draws cut-outs from the model sheets today** (`scripts/client_figures.py`,
  `web/client/figures.js`): one photograph per direction, scaled, with a bob for walking and a
  standing figure lowered into the seat for sitting. These sprites are what replaces them; nothing
  in the game uses them yet.
- **The outfit is the data's.** Where a reference sheet shows another look (Dominique's turnaround
  is her weekend look, Dax's an all-black tee), the prompt asks for the outfit in the data; the
  sheet is for the face, hair, skin and build.
- **The created residents' looks are read off their sheets**, because they live only in a save
  (D-044) and have no data file; their facts say "(from the sheet)". A player who makes a character
  with the same name gets the same art, as with the faces.
- When a generated picture gets a fact wrong, say so in `art/manifest.json` under `notes`, as the
  other art does. Nobody should mistake a picture for the game's state.
"""

SPRITE_NOTES = """\
A sheet replaces the cut-outs in three steps. None of them is built yet.

1. **The sheet** (this pack): `art/sprites/characters/<id>/sheet.png`, 4 × 3 cells as above.
2. **The frames** (planned: `scripts/client_figures.py` cutting the cells): `walk_front34_1` to
   `_4`, `walk_back34_1` to `_4`, `idle_front34`, `idle_back34`, `sit_chair`, `sit_sofa`, trimmed
   and scaled like the cut-outs to 360 px for a 1.75 m person, with their feet (or, sitting, the
   seat) as the anchor, into `web/client/figures/<id>/` and its manifest.
3. **The client** (planned, `web/client/figures.js`, same `drawFigure()` API): the walk frames for
   `pose: "walk"` by `phase`, the idle frames for standing, the seated frames for `pose: "sit"` in
   place of the lowered standing figure; mirrored for the other two diagonals.

Fighting (fists up) and flinching are not in these sheets: today `pose: "fight"` and `"flinch"`
lean, crouch and bounce or shake the standing picture. A later sheet can ask for them.
"""

# The created residents (art/manifest.json `residents`): their looks, read off their sheets' name
# cards and turnarounds. Facts here are the sheets', not data.
RESIDENTS = {
    "kai-morgan": {"age": 22, "pronouns": "he/him", "height_cm": 183, "build": "lean", "skin": "deep brown, neutral",
                   "eyes": "brown", "face": "round brown eyes, square face, wide nose, full lips, stubble",
                   "hair": "black shoulder-length locs under a black baseball cap",
                   "style": "red zip-up hoodie over a white tee, baggy black cargo jeans, red-and-white high-top sneakers drawn plain (no recognisable design)",
                   "jewelry": "a silver chain necklace, pierced ears", "key_features": ["Black locs and stubble", "Forearm-script and hand tattoos", "Baseball cap and streetwear"]},
    "rosa-delgado": {"age": 27, "pronouns": "she/her", "height_cm": 168, "build": "athletic", "skin": "olive, warm",
                     "eyes": "almond, dark brown", "face": "oval face, full lips, natural makeup",
                     "hair": "a sleek, long black high ponytail",
                     "style": "olive-green zip track jacket over a white crop top, black leggings, white trainers",
                     "jewelry": "a plain black smartwatch (no recognisable design), small studs", "key_features": ["Sleek black ponytail", "Wrist tattoo and pierced ears", "Athleisure and a watch"]},
    "sol-rivera": {"age": 26, "pronouns": "they/them", "height_cm": 170, "build": "lean", "skin": "golden brown, warm",
                   "eyes": "amber, almond-shaped, graphic liner", "face": "freckles, septum and helix piercings",
                   "hair": "a copper curly afro under a deep teal corduroy bucket hat",
                   "style": "cream shirt with a small red-and-teal print, sleeves rolled, a brown corduroy waistcoat, wide brown corduroy trousers, brown leather loafers",
                   "jewelry": "silver rings, a small pendant", "key_features": ["Copper curly afro", "Fine-line floral and wrist tattoos", "Rings and a bucket hat"]},
    "theo-grant": {"age": 24, "pronouns": "he/him", "height_cm": 170, "build": "lean", "skin": "golden brown, warm",
                   "eyes": "almond, amber", "face": "heart-shaped face, full lips, stubble",
                   "hair": "a black buzz cut",
                   "style": "royal-blue fleece zip hoodie over a white tee, grey cargo joggers, white trainers",
                   "jewelry": "a thin gold chain necklace, pierced ears", "key_features": ["Black buzz cut and stubble", "Forearm-script tattoo", "Streetwear"]},
}


def founders():
    out = []
    for f in sorted((DATA / "characters").glob("*.json")):
        for c in tp.load_json(f).get("characters", []):
            if not c.get("playable", False):
                continue
            a = c.get("profile", {}).get("appearance", {})
            sheets = a.get("reference_sheets", {})
            out.append({"id": c["id"], "name": f"{c['first_name']} {c['last_name']}", "age": c.get("age"), "pronouns": c.get("pronouns", ""),
                        "title": c.get("profile", {}).get("archetype", ""), "look": a, "source": "data",
                        "sheet": sheets.get("turnaround") or a.get("visual_reference", ""), "data_file": f.relative_to(ROOT).as_posix()})
    return out


def residents():
    m = tp.load_json(MANIFEST).get("residents", {})
    out = []
    for rid, r in sorted(m.items()):
        look = RESIDENTS.get(rid)
        if look is None:
            raise SystemExit(f"character_prompts: no look for resident {rid}; add it to RESIDENTS from their sheet")
        out.append({"id": rid, "name": r["name"], "age": look["age"], "pronouns": look["pronouns"], "title": r.get("card_title", ""),
                    "look": look, "source": "sheet", "sheet": r["sheet"], "notes": r.get("notes", [])})
    return out


def px_for(cm):
    return round(REF_PX * cm / REF_CM)


def signature(style):
    """The outfit to draw: the whole style, or its work look when the data gives several ("work: …; evening: …")."""
    if not style.lower().startswith("work:"):
        return style, None
    looks = [s.strip() for s in style.split(";")]
    return looks[0].split(":", 1)[1].strip(), "; ".join(looks[1:]) or None


def prompt_for(ch):
    a, sheet = dict(ch["look"]), ch["sheet"]
    other = None
    if a.get("style"):
        a["style"], other = signature(a["style"])
    cm = a.get("height_cm")
    if not cm:
        raise SystemExit(f"character_prompts: {ch['id']} has no height_cm")
    tag = " (from the sheet)" if ch["source"] == "sheet" else ""
    facts = [("Who", f"{ch['name']}, {ch['age']}, {ch['pronouns']}" + (f" · {ch['title']}" if ch["title"] else "")),
             ("Height", f"{cm} cm{tag} → {px_for(cm)} px tall in a {CELL_PX} px cell (175 cm = {REF_PX} px)")]
    for key, label in (("build", "Build"), ("skin", "Skin"), ("eyes", "Eyes"), ("face", "Face"), ("hair", "Hair"),
                       ("style", "Wearing"), ("jewelry", "Jewellery"), ("silhouette", "Silhouette")):
        if a.get(key):
            facts.append((label, f"{a[key]}{tag}"))
    if other:
        facts.append(("Other look (not drawn)", other))
    if a.get("key_features"):
        facts.append(("Key features", "; ".join(a["key_features"]) + tag))
    facts.append(("Reference sheet", sheet))
    if ch["source"] == "data":
        facts.append(("From", f"{ch['data_file']} (profile.appearance)"))
    else:
        facts.append(("From", "art/manifest.json residents (name, card title) and the sheet's name card and turnaround; no data file"))
    for n in ch.get("notes", []):
        facts.append(("Manifest note", n))
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
    return {"id": ch["id"], "title": ch["name"], "section": "founders" if ch["source"] == "data" else "residents",
            "save_as": save_as, "facts": facts, "prompt": prompt}


SECTIONS = [("founders", "Founders"), ("residents", "Created residents")]


def ordered(prompts, section):
    return sorted((p for p in prompts if p["section"] == section), key=lambda p: p["title"])


def render_markdown(prompts, counts):
    out = ["# LIVÉRA character sprite prompt pack", "",
           f"Generated by `{SELF}` from `data/characters` and the residents in `art/manifest.json`. Do not edit by hand: "
           f"rerun the script after changing the data, and `python3 {SELF} --check` fails when this file is stale or a founder "
           "or named resident has no prompt.", "",
           f"{len(prompts)} prompts: {counts['founders']} founders and {counts['residents']} created residents, one sprite sheet "
           f"each. {counts['filed']} of {len(prompts)} are filed. The phone page `art/prompts_characters.html` has the same "
           "prompts with a Copy button and a done checkbox.", "",
           "## How to use (on a phone)", "",
           "1. Open `art/prompts_characters.html` and tap **Copy** on a card.",
           "2. Paste into the image generator and attach the reference sheet named in the prompt. Each prompt already "
           "carries the style sheet, the layout, the size and the transparent background.",
           "3. Check that it is the same person in all twelve cells, seen from the town's angle, at the height the prompt "
           "gives, with nothing cropped and no background.",
           "4. Save the file under the name at the end of the prompt and add it to `art/manifest.json` (a `sprites` entry "
           "for the character), with anything the picture gets wrong under `notes`.",
           "5. Tick **done** on the card. The page remembers it on that phone.", "",
           "## Style sheet", "", STYLE_SHEET, "## What these prompts are not", "", HONESTY_NOTES,
           "## How a sheet replaces the cut-outs", "", SPRITE_NOTES]
    for key, label in SECTIONS:
        out += [f"## {label}", ""]
        for p in ordered(prompts, key):
            out += [f"### {p['title']}" + (" (filed)" if p["filed"] else ""), "",
                    f"Save as `{p['save_as']}` · {SIZE}" + (f" · filed as `{p['filed']}`" if p["filed"] else ""), "",
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
           f'<p class="lead">{len(prompts)} prompts generated by <code>{h(SELF)}</code> from the game\'s data: '
           f"{counts['founders']} founders and {counts['residents']} created residents. Each asks for one sprite sheet: a walk "
           "cycle each way, standing, and sitting on a chair and a sofa, at the town's camera angle and golden-hour light. "
           "Tap Copy, paste into the image generator with the reference sheet attached, save under the name at the end, tick done. "
           f"{counts['filed']} of {len(prompts)} are filed.</p>",
           '<p class="lead"><strong>Not in the game yet:</strong> the map draws cut-outs from the model sheets today. '
           "These sprites replace them once they're made (see the style sheet below).</p>",
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
            out.append(f'<p class="meta">Save as <code>{h(p["save_as"])}</code> · {h(SIZE)}</p>')
            out.append(f'<pre class="prompt">{h(p["prompt"])}</pre>')
            out.append('<div class="row"><button type="button" class="copy">Copy</button>'
                       '<label><input type="checkbox" class="done-box"> done</label></div>')
            out.append("<details><summary>Facts</summary><dl>"
                       + "".join(f"<dt>{h(k)}</dt><dd>{h(v)}</dd>" for k, v in p["facts"]) + "</dl></details>")
            out.append("</article>")
    out += ["<footer>No external resources. The done ticks live in this browser's localStorage only. "
            "When a picture gets a fact wrong, say so in art/manifest.json under notes.</footer>",
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
    cast = founders() + residents()
    prompts = [prompt_for(c) for c in cast]
    for p in prompts:
        p["filed"] = tp.filed_as(p["save_as"])
    ids = [p["id"] for p in prompts]
    assert len(ids) == len(set(ids)), "duplicate prompt id"
    want = {c["id"] for c in founders()} | set(json.loads(MANIFEST.read_text(encoding="utf-8")).get("residents", {}))
    missing = sorted(want - set(ids))
    counts = {"founders": sum(1 for p in prompts if p["section"] == "founders"),
              "residents": sum(1 for p in prompts if p["section"] == "residents"),
              "filed": sum(1 for p in prompts if p["filed"])}
    md, page = render_markdown(prompts, counts), render_html(prompts, counts)
    if args.check:
        stale = [p for p, text in ((MD_PATH, md), (HTML_PATH, page)) if not p.exists() or p.read_text(encoding="utf-8") != text]
        for p in stale:
            print(f"character_prompts: {p.relative_to(ROOT)} is stale; run python3 {SELF}", file=sys.stderr)
        if missing:
            print("character_prompts: no prompt for " + ", ".join(missing), file=sys.stderr)
        if stale or missing:
            return 1
        print(f"character_prompts: ok, {len(prompts)} prompts cover {counts['founders']} founders and {counts['residents']} residents")
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
