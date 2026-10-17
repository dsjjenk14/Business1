# LIVÉRA art

`PROMPT_PACK.md` has ready-to-paste image prompts for the art still missing: the residents made in the creator, babies and children, pets, items, buildings, the bus and icons. It ends with a prompt for adding the finished images to the repo.

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
"art: the manifest links to files that exist and to real ids" keeps every path and id true.
Each entry has `notes` for anything the picture gets wrong about the game, such as a pet's age
on its card; read them before using a card as fact.

| Folder | What it holds |
|---|---|
| `reference/residents/<id>.jpg` | Model sheets for created residents: Sol Rivera (The Free Spirit), Theo Grant (The Fresh Start), Rosa Delgado (The Guardian), Kai Morgan (The Upstart). |
| `avatars/<id>.jpg` | Square head-and-shoulders crops from those sheets (native 450 px, not upscaled); the town preview uses them. |
| `pets/named/<owner>_<pet>.jpg` and `_face.jpg` | Sheets and square face crops for Bramble (Aaliyah's rabbit), Rocky (Rosa's beagle) and Pepper (Harper's terrier mix). |
| `places/<location_id>.jpg` | Building exteriors: Body & Balance so far. |
| `transit/` | The Line 1 bus collage, a side view (grey background, not a transparent sprite) and small shelter crops per stop in `stops/<stop_id>.jpg`. |
| `city/` | Panoramas: `stage_1.jpg` (Founding Town), `stage_5.jpg` (Metropolis) and `construction.jpg` (a building site). Stages 2–4 are missing. |
| `concept/` | Posters whose districts and street layout are **not** the game's. Concept only; never a map. |
| `_incoming/` | Where new images land before they are checked. Not committed. |

Sheets are JPEG copies at quality 90 with no metadata; keep the masters outside the repository.
Card titles for created residents are proposals from `PROMPT_PACK.md`, not data.
