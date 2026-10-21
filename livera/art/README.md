# LIVÉRA art

`PROMPT_PACK.md` has ready-to-paste image prompts for the art still missing: the residents made in the creator, babies and children, pets, items, buildings, the bus and icons. It ends with a prompt for adding the finished images to the repo.

## The look (`STYLE.md`)

`STYLE.md` sets the look everything follows, taken from the owner's four reference pictures:
golden-hour light, ivory and sand stone, champagne gold, deep emerald, sage trees, a river with
an arched bridge. It gives the palette, the light, the motifs and what the look must never add.

## Character reference sheets (`reference/characters/`)

The approved look of each founding character. Modelers, costume and hair artists should
work from these files. Each character's data file links to its sheet in
`profile.appearance.visual_reference`, and a test checks that every link points to a
file that exists.

| Character | Sheet | Card title |
|---|---|---|
| Dominique Ashford | `dominique_ages.jpg` (main) | life stages: 19, 24, 29 |
| Dominique Ashford | `dominique.jpg` | turnaround + expressions (weekend look) |
| Dax Hendrix | `dax.jpg` | work and evening looks, turnaround, expressions |
| Harper James | `harper.jpg` | The Confidante |
| Andre Campbell | `andre.jpg` | The Wild Card |
| Naomi Ellis | `naomi.jpg` | The Visionary |
| Graham Whitaker | `graham.jpg` | The Investor |
| Maya Bennett | `maya.jpg` | The Idealist |
| Julian Park | `julian.jpg` | The Innovator |
| Leila Rahal | `leila.jpg` | The Insider |
| Aaliyah Baptiste | `aaliyah.jpg` | The Connector |
| Sienna Brooks | `sienna.jpg` | The Tastemaker |

These are JPEG copies (quality 90, full resolution) of the original PNG sheets, so the
repository stays small. Keep the original PNGs as the masters.

A character can have several sheets. `visual_reference` names the main one;
`appearance.reference_sheets` lists them all by kind (`life_stages`, `turnaround`...).

## Life-stage sheets

A life-stage sheet shows one character at several ages, each labelled (e.g. "DOMINIQUE —
AGE 19"). It goes with `profile.life_stages` in the character's data: one entry per panel,
with that age's chapter of their story and the look in the panel. The generational system
(children who grow up, people who age) will use the same format.

## What a sheet must show

When a new character is added, their sheet should include:
- a full-body front view and at least one back or three-quarter view,
- head-and-shoulders expression studies,
- the signature outfit, plus an evening or alternate look if they have one,
- a name card with age, height, occupation, build, skin tone and key features.

Each character needs a recognizable silhouette, face, wardrobe and palette. No two
characters should read as interchangeable.

## Art for what lives in a save (`manifest.json`)

Residents made in the character creator and named pets exist only in a save, so their art is
listed in `manifest.json` (decision D-044) rather than in `data/characters`. The test
"art: the manifest links to files that exist and to real ids" checks that every path exists, that no
founder is listed as a created resident, that pet keys are `owner:name` with a real species, and that
place and stop ids are the game's.
Each entry has `notes` for anything the picture gets wrong about the game, such as a pet's age
on its card; read them before using a card as fact.

| Folder | What it holds |
|---|---|
| `reference/residents/<id>.jpg` | Model sheets for created residents: Sol Rivera (The Free Spirit), Theo Grant (The Fresh Start), Rosa Delgado (The Guardian), Kai Morgan (The Upstart). |
| `avatars/<id>.jpg` | Square head-and-shoulders crops from those sheets (native 450 px, not upscaled); the town preview uses them. |
| `pets/named/<owner>_<pet>.jpg` and `_face.jpg` | Sheets and square face crops (450–500 px) for Bramble (Aaliyah's rabbit), Rocky (Rosa's beagle) and Pepper (Harper's terrier mix); a single portrait and face crop for Shadow (Leila's Maine Coon mix), who has no sheet yet. |
| `places/<location_id>.webp` (and `.jpg`) | Map sprites, one per place: isometric, golden hour, transparent, made from `PROMPT_PACK_TOWN.md` (52 places so far; some with an `_alt` version, construction sites with a `_framed` stage). Apartment and condo buildings (`lexington`, `maple_court`, `riverside_lofts`, `lakeview`) are listed under `unit_buildings` in the manifest with the units they stand for. Kept as WebP with transparency at full size (the 2 MB PNG masters stay outside the repository); the web client uses 640 px copies in `web/client/sprites/`. `body_balance.jpg` is an earlier photograph, kept as the gym's `photo`. |
| `items/<item_id>.png` or `.jpg` | Product pictures: wireless headphones, the laptop, and the three Lyra phones. The phones' screens are decoration, not the game's phone UI. |
| `sprites/characters/<id>/sheet.webp` | Each person's sprite sheet from `PROMPT_PACK_CHARACTERS.md` (4 × 3 cells: two walks, standing front and back, sitting on a chair and on a sofa), listed under `sprite_sheets` in the manifest; 10 of 15 so far. The game doesn't use them yet: it draws cut-outs of the model sheets (D-067). |
| `transit/` | The Line 1 bus collage, a side view, the bus's front and rear three-quarter views (`bus_line_1_front.webp`, `bus_line_1_rear.webp`), the Livéra Transit mark, a transit card (branding only), a stylised route diagram, and a shelter per stop: full transparent sprites in `stops/<stop_id>.webp` for all seven stops, and `stops/<stop_id>.jpg`, the earlier small crops from the collage (Lexington Ave & River Rd's is a full picture). |
| `tiles/<name>.webp` | Ground tiles (grass, sidewalk, straight road, corner, crossroad, gravel road, river edge), the tower crane and the sketch's arched bridge, from the prompt pack's "Ground tiles and the crane". The flat tiles are 2:1 diamonds; the client re-projects them. |
| `city/` | Panoramas: `stage_1.jpg` (Founding Town), `stage_5.jpg` (Metropolis) and `construction.jpg` (a building site). Stages 2–4 are missing. |
| `concept/` | Posters whose districts and street layout are **not** the game's, two unassigned interiors and a laptop product set. Concept only; never a map. |
| `_incoming/` | Where new images land before they are checked. Not committed; move the masters out once the JPEGs are made. |

Sheets are JPEG copies at quality 90 with no metadata; keep the masters outside the repository.
Card titles for created residents are proposals from `PROMPT_PACK.md`, not data.

## Town sprites for the map (`PROMPT_PACK_TOWN.md`, `prompts_town.html`)

The isometric sprites the map needs are prompted from the game's data, not written by hand:
`scripts/town_prompts.py` reads `data/world`, `data/transit`, `data/city` and `data/config` and
writes `PROMPT_PACK_TOWN.md` (one prompt per place, bus stop, bus view, construction stage and
ground tile, with the facts each was built from) and `prompts_town.html`, the same prompts as a
phone page with a Copy button, the facts, the file name to save as and a "done" tick kept in that
browser's localStorage. The page loads nothing from the network. Never edit the two files by hand:
change the data or the script and rerun it.

```bash
python3 scripts/town_prompts.py          # regenerate both files after editing data/
python3 scripts/town_prompts.py --check  # fails if a location, stop or line has no prompt, or the files are stale
```

Run the check next to `scripts/format_data.py` whenever `data/` changes; it is Python only and
needs no build. Apartment and condo units that share a door get one prompt for the building,
named by the id the sketch client groups them under (`lexington`, `maple_court`,
`riverside_lofts`, `lakeview`). Construction sites get a bare-site and a framed prompt. Files go to
`art/places/<location_id>.png`, `art/transit/stops/<stop_id>.png`, `art/transit/bus_line_1_<view>.png`
and `art/tiles/<name>.png`, then into `manifest.json`. The same notes rule applies as for everything
else in the manifest: when a generated picture gets a fact wrong (a misspelled sign, an extra
storey, a lit "open" sign on a place that is still a building site), the entry's `notes` say so,
and nobody treats the picture as the game's state. The prompts' art direction (what a building
looks like beyond its data description) is marked as such in each prompt's facts.

## What's still needed (`prompts_needed.html`)

`scripts/art_needed.py` writes one phone page with only the pictures the game doesn't have yet, from the interior and town packs
(rooms first), with the same Copy buttons and done ticks. Run it after filing a picture; `--check` fails when the page is stale.

## Interiors (`PROMPT_PACK_INTERIORS.md`, `prompts_interiors.html`)

`scripts/interior_prompts.py` prompts the inside of every place a character can enter and every home, the same way:
from `data/world`, `data/careers` and `data/characters`, into `PROMPT_PACK_INTERIORS.md` and a phone page,
`prompts_interiors.html`. Each picture is one cutaway room at the town sprites' camera angle, drawn to scale with
clear walkways, every seat and bed in view, and a piece of furniture for each activity the place offers (a shower
for "Take a shower", the sofa for "Nap on the sofa"), so the rooms can later be walked around and sat in. Homes
the data describes the same way share one picture. Walking around inside and sitting are **not in the game yet**;
the pack's "How a picture becomes a room you can walk in" says what is planned. Files go to
`art/interiors/<id>.png` (shared pictures are named by their homes, e.g. `willow_lane_2_4_6_8.png`), then into
`manifest.json` under `interiors`, with notes as for everything else.

```bash
python3 scripts/interior_prompts.py          # regenerate both files after editing data/
python3 scripts/interior_prompts.py --check  # fails if a place someone can enter has no prompt, or the files are stale
```

## Full-body figures for the map (`web/client/figures/`)

`scripts/client_figures.py` cuts every full-body view off the model sheets (`reference/characters/`,
`reference/residents/`) for the web client, which draws people whole with them (`web/client/figures.js`, D-067):
each view cut out of its background (BiRefNet through `rembg`, run offline once its model is downloaded; the hair
keeps its edge with no background halo), scaled to one game height (360 px for a 1.75 m person, everyone at their
real height), feet found and written to `web/client/figures/<id>/<view>.webp` and `manifest.json`. Dominique has a
five-view turnaround; Dax and the four residents four views; the other nine founders' sheets are photo collages, so
they have a walking shot ("front") and a shot from behind ("back34") only. The masters stay outside the repository.

```bash
python3 scripts/client_figures.py --preview /tmp/figs   # rebuild, and write every view on sand and night to look at
```

## Character sprites (`PROMPT_PACK_CHARACTERS.md`, `prompts_characters.html`)

`scripts/character_prompts.py` prompts one sprite sheet per founder (from `data/characters`) and per named resident
(from their sheets; they live only in a save): the person at the town sprites' camera and golden-hour light, a 4-frame
walk toward the camera's left and one away to its right (the other two by mirroring), standing, and sitting on a chair
and a sofa, at one scale, with their model sheet attached as the reference. Files go to
`art/sprites/characters/<id>/sheet.png`; the cut-outs above are used until they exist (the pack says how they'll replace
them).

```bash
python3 scripts/character_prompts.py          # regenerate both files after editing data/characters
python3 scripts/character_prompts.py --check  # fails if a founder or named resident has no prompt, or the files are stale
```
