# LIVÉRA Art Prompt Pack

This pack has prompts for every picture the game still needs: faces for residents who have no art, babies and children, pets, items, buildings, the bus and icons. They match the existing sheets in `livera/art/reference/characters/`.

Some sources named below (`play56.py`, `rec2/sheets.py`, the recording's saves) are the town-preview recording scripts, which live outside this repository. The facts taken from them are copied into this pack.

## How to use this

1. **Pick a picture.** If you're not sure where to start, use the order under "What to make first" below.
2. **Open an image tool**, such as ChatGPT image generation or Midjourney.
3. **Attach one existing LIVÉRA sheet as a style reference.** §1.1 says which sheet to use for each kind of picture.
   - In ChatGPT, upload the sheet. The style block already tells the tool to use it for style only.
   - In Midjourney, add `--sref <the sheet's URL>` and set the shape with `--ar 3:2`, `--ar 2:3` or `--ar 1:1`.
4. **Paste the STYLE BLOCK (§1.1)**, then the layout block if the prompt names one, then the prompt itself.
5. **Check the result.** The face must match across panels, and the name and captions must be spelled exactly right (§6.3). If the tool can't spell the card, use §1.4.
6. **Save the files** with the names in §6.2 into one folder, then paste the §7 prompt into Claude Code to add them to the game.

**What to make first:**

1. Sheets and avatars for Sol, Theo, Rosa and Kai (§2). The game has no face for them yet.
2. Portraits of the four pets that exist (§4.5).
3. The bus, the stops and the buildings (§5.5–5.6).
4. Items, food and icons (§5.2–5.8).
5. Life-stage templates for babies and children (§3). These are style references only until a baby is born.
6. Extra sheets for the founding cast (§2.6).

Every fact about a person, place or item comes from `livera/data/**/*.json`, `scripts/demo/sol_rivera.json`, the recording scripts (`play56.py`, `rec2/sheets.py`) or the recording's Day 28 save. Anything marked **(art direction)** is a styling choice that is not in the data. The style was checked against five sheets: `dax.jpg`, `harper.jpg`, `andre.jpg`, `dominique.jpg` and `dominique_ages.jpg`.

## Ground rules

- **Use only stated data.**
  - Don't guess anyone's ethnicity. The data gives none for Dominique, Dax or any resident made in the creator, so their cards have no Ethnicity row.
  - Use pronouns exactly as the data gives them.
- **No real people and no real brands.**
  - No likeness of a real person or celebrity.
  - No real logos, monogram patterns, lock-and-strap bag hardware or recognisable designer products. Three things on the existing sheets show what to avoid: the age-19 backpack and the age-29 bag on `dominique_ages.jpg`, and the bag on `dominique.jpg`. When you attach either Dominique sheet, add "do not copy the bags or backpack".
  - In-game brands are fine: Lyra, LivPay, Ellis Atelier, Atelier Nuit, Riviera, Meridian, Lustre, Livéra Transit and every business name in the data.
- **Never pretend.**
  - Don't present a person, baby or pet as real until the game has them. Templates are labelled as templates.
  - Don't draw crowds. The town's population is abstract numbers, so streets and buildings are empty.
  - Station 1 Fire & Rescue is a placeholder landmark only.
  - Don't draw cars. The game has no driving. Dax's "pickup truck keys" are only flavour text in his starting inventory. §5.9 has car prompts ready for when driving is added.
- **Everyone must look like themselves.** `art/README.md` says no two characters may read as interchangeable. Take particular care with these pairs:
  - Kai and Andre;
  - Theo and Sol, whose face options are identical;
  - Theo and Kai, who share stubble, streetwear, a forearm-script tattoo, ear piercings and a chain.
- **Under-18s never get the glamour treatment.** They always use the FAMILY STYLE BLOCK (§3.1).

---

## 1. Style blocks

### 1.1 STYLE BLOCK (paste before any prompt)

```text
STYLE BLOCK — LIVÉRA house style. I have attached an existing LIVÉRA character sheet as a STYLE REFERENCE ONLY: match its photography, colour grade, typography, gutters and layout, but do not copy its person's face, body, hair, clothes or bag. Photorealistic luxury fashion-editorial photography, like a high-end lifestyle magazine shoot: not an illustration, painting or 3D render, no outlines. 85mm lens look, shallow depth of field, creamy bokeh; warm cinematic light from golden-hour sun through floor-to-ceiling windows and warm tungsten lamps, a soft rim light on the hair; rich warm shadows and amber highlights, never a cool or teal grade; skin lightly retouched but keeping natural texture. The same person, with the same face, hair, skin, tattoos, piercings and jewellery, appears in every panel. Panels are separated by thin cream-gold hairline gutters, with no outer frame. The name card is a solid near-black panel (about #0a0a09): first name in very large letter-spaced warm-ivory serif capitals (about #f0dcc0), surname smaller and widely tracked beneath, the archetype title in small, widely tracked champagne-gold capitals (about #cfb991), a thin gold hairline rule, a two-column table with champagne-gold serif labels and ivory serif values, then "KEY FEATURES" and "PERSONALITY" headings in tracked champagne-gold capitals, each line with a small ivory diamond (◆) bullet. All type is an elegant old-style Garamond serif like Cormorant Garamond, spelled exactly as given. Outfit-panel captions sit on a dark strip along the bottom of the photo in tracked champagne-gold serif capitals; expression captions sit on a black strip below the photos; turnaround captions are small dark-grey serif capitals on the grey backdrop. DEFAULT LAYOUT (FORMAT B), a landscape 3:2 model sheet. TOP ROW (about 60% of the height), left to right: a large head-and-shoulders close-up with a hand near the face against warm amber city-night bokeh (about 34% of the width); the name card (about 19%); two outfit panels, knee-up or seated (about 23% each), each captioned at the bottom. BOTTOM ROW: four head-and-shoulders expression close-ups captioned NEUTRAL, SMILE, SERIOUS, THOUGHTFUL on warm bokeh (about 55% of the width), then a full-body studio turnaround on a seamless light-grey backdrop with flat, soft, even light and soft floor shadows, captioned FRONT, THREE-QUARTER, SIDE, BACK (about 45%). No real person or celebrity likeness, no real brand logos, monogram patterns, lock-and-strap bag hardware or recognisable designer products, no watermark, and no text other than the text given. If the prompt below asks for something other than a character sheet, keep only the photography, light, colour and typography rules and follow that prompt's framing.
```

**Which sheet to attach as the style reference:**

| Picture | Attach |
|---|---|
| Landscape model sheet (Format B) | `dax.jpg` |
| Portrait workplace collage (Format A) | `harper.jpg` or `andre.jpg` |
| Turnaround and expressions with no text (Format C) | `dominique.jpg` (add "do not copy the bag") |
| Life-stage or aging strip (Format D) | `dominique_ages.jpg` (add "do not copy the bags or backpack") |
| Items, buildings, icons, pets | any one sheet, for colour and light only |

### 1.2 Layout swaps

To replace the default layout, add one of these after the STYLE BLOCK.

**FORMAT A: portrait workplace collage, 2:3** (matches the nine founder collages)

```text
LAYOUT OVERRIDE (FORMAT A) — portrait 2:3 collage of seven photographs. LEFT COLUMN (about 38% of the width): the top 61% is a full-body front view walking toward the camera, one or both hands in pockets, carrying a bag in the other hand if they carry one; the bottom 39% is the name card, which in this format shows the full name on ONE line in large letter-spaced ivory serif capitals with the archetype beneath, then the table, KEY FEATURES and PERSONALITY. RIGHT SIDE (about 62% of the width), a 2×3 grid: row 1 is a face close-up (a hand at the chin or cheek is optional), then an over-the-shoulder look back; row 2 is two seated poses in a leather club chair, one writing in a notebook or with a hand at the chin, one relaxed, leaning forward or with a hand at the temple; row 3 is a large close-up portrait with a warm smile or laugh, then a full-body rear three-quarter view walking away and looking back. All seven panels are set in {WORKPLACE}, with a city skyline through floor-to-ceiling windows at golden hour or dusk. The same signature outfit appears in every panel. Thin cream gutters, no outer frame.
```

**FORMAT C: turnaround and expressions** (matches `dominique.jpg`)

```text
LAYOUT OVERRIDE (FORMAT C) — landscape 3:2. TOP (about 70% of the height): a full-body studio turnaround of the same person in one outfit on a seamless light-grey backdrop with flat, soft, even light and soft floor shadows, five evenly spaced views: front, three-quarter, side, back three-quarter looking over the shoulder, and back. BOTTOM (about 30%): four head-and-shoulders close-ups on the same light-grey backdrop, separated by thin light gutters: neutral, soft smile, serious, open laugh. No name card, no captions, no text.
```

**FORMAT D: life-stage strip** (matches `dominique_ages.jpg`)

```text
LAYOUT OVERRIDE (FORMAT D) — {3 or 4} full-length standing portraits of the same subject at different ages, side by side and separated by thin light dividers. Each is on a mottled, painted warm-grey studio backdrop with a soft vignette, lighter toward the floor, in soft studio light. Each panel has a black caption band along the bottom with centred, widely tracked champagne-gold serif capitals reading "{CAPTION}". No other text.
```

### 1.3 Avoid list (add to any prompt if the tool takes negative prompts)

```text
Avoid: cartoon, anime, illustration, 3D render, outlines, cool or teal colour grade, harsh flash, real brand logos, monogram patterns, lock-and-strap bag hardware, recognisable designer products, celebrity likeness, watermark, misspelled text, extra text, extra fingers, a different face between panels, background people, cars.
```

### 1.4 If the tool garbles the card text

Generate the picture again and add this line: `Leave the name card as an empty solid near-black panel with only the gold hairline rule; no text on it.` Then have Claude Code typeset the card in Cormorant Garamond, using the exact text from the character's prompt (step 6 of the §7 prompt). The town preview already loads that font.

---

## 2. Residents who need a sheet

All 11 founding characters have a sheet. The four residents made in the character creator have **no art at all**, so the town preview shows their initials instead of a face.

This table shows them as of the end of Day 28 of the recording:

| id | Name | Age | Pronouns | Job | Home |
|---|---|---|---|---|---|
| `sol-rivera` | Sol Rivera | 26 | they/them | Shift Lead, Heritage Coffee Co. (promoted from Barista) | Maple Court 2A |
| `theo-grant` | Theo Grant | 24 | he/him | Shift Supervisor, Greenleaf Market (promoted from Cashier) | Maple Court 2B |
| `rosa-delgado` | Rosa Delgado | 27 | she/her | Assistant Manager, Thread & Co. (she started one level up: "Came to move up"); Police Academy trainee, not yet graduated | Maple Court 3B |
| `kai-morgan` | Kai Morgan | 22 | he/him | Beatmaker, Low End Studios (from Day 25; before that Barback at The Copper Tap); enrolled in a bachelor's at Livéra University | Maple Court 4A |

**Check age and job title before you generate.**
- **Ages.** Everyone ages one year per game year, which is 336 game days or about 5.6 real days at normal speed. Birthdays are spread across the year; in the recording, Andre has already turned 30.
- **Jobs.** Days 29–34 are still being recorded, and job titles change with promotions and new jobs.
- Look up the current age and title in the game and put those on the card.

**Card titles.** None of the four has an archetype in the data; the preview says "Made in the character creator". The titles below are proposals based on each person's traits and highest values, and the owner should approve them. Each section lists alternatives.

### 2.1 Avatar headshot template (everyone, including future players and children)

```text
[STYLE BLOCK]
Square 1:1 avatar headshot of {FULL NAME}. Attach this person's finished LIVÉRA sheet as the identity reference: same face, hair, skin, piercings and accessories. Head and shoulders, face centred, eyes on the upper-third line, the face filling about 60% of the frame so it still reads in a 160-pixel circular crop. Looking into the camera with {EXPRESSION}. The signature outfit shows at the collar. Background is warm amber city-night bokeh. No text, no border, no hands covering the face.
```

**For anyone under 18:** add the FAMILY STYLE BLOCK (§3.1). Use a plain warm home background instead of city bokeh, and a natural expression.

### 2.2 Sol Rivera

**From the data** (`scripts/demo/sol_rivera.json` and the save):
- **Age and identity:** 26, they/them, non-binary. The sheet's `sex` field only affects pregnancy, so there is nothing to draw from it.
- **Skin and face:** golden-brown skin with a warm undertone; heart-shaped face; almond-shaped amber eyes; straight nose; full lips.
- **Body:** lean, 170 cm.
- **Hair and makeup:** copper curly afro; no facial hair; graphic liner.
- **Style:** vintage clothes. Tattoos: fine-line florals and wrist. Piercings: septum and helix. Accessories: rings and a bucket hat.
- **Personality:** traits creative, outgoing, witty. Highest values: freedom 75, community 70, creativity 70.
- **Story:** "Played keys in church growing up, then in every bar band that would have them. Took the barista job for the rent and the open mic." Goals: release an album, make friends. Promoted to Shift Lead in the recording.

**Card title:** THE FREE SPIRIT. Alternatives: The Spark, The Headliner.

**Palette (art direction):** dusty teal, cream and warm brown; gold and silver rings.

```text
[STYLE BLOCK]
Character model sheet, landscape 3:2, of SOL RIVERA, age 26, a non-binary barista and keyboard player in the town of Livéra. Sol uses they/them. Style Sol as non-binary: relaxed, androgynous vintage tailoring and an easy, confident posture, with no gendered glamour posing.

Keep these features identical in every panel: golden-brown skin with a warm undertone; a heart-shaped face; almond-shaped amber eyes; a straight nose; full lips; no facial hair; bold graphic eyeliner; a lean build, 170 cm tall; a copper-coloured curly afro; a septum ring and a helix piercing; fine-line floral tattoos on one forearm and a small wrist tattoo; several rings on both hands; a bucket hat.

Palette: dusty teal, cream and warm brown, with gold and silver rings.

Signature outfit (close-up, expressions and turnaround), vintage: a 1970s-style cream camp-collar shirt with a small teal-and-rust geometric print, a fitted brown corduroy vest, high-waisted straight brown corduroy trousers, worn tan leather loafers, a teal corduroy bucket hat, stacked rings.

Panels:
- Large close-up: head and shoulders, one ringed hand at the brim of the bucket hat, a witty closed-mouth half-smile. Behind: Heritage Coffee bokeh (exposed brick, the warm glow of an espresso machine).
- Name card, text exactly:
  SOL
  RIVERA
  THE FREE SPIRIT
  Age | 26
  Pronouns | they/them
  Height | 170 cm
  Occupation | Shift Lead, Heritage Coffee Co.
  Build | Lean
  Skin Tone | Golden brown, warm
  Eye Color | Amber
  KEY FEATURES: ◆ Copper curly afro ◆ Almond amber eyes ◆ Graphic liner ◆ Septum and helix piercings ◆ Fine-line floral and wrist tattoos ◆ Rings and a bucket hat
  PERSONALITY: ◆ Creative ◆ Outgoing ◆ Witty
- Outfit panel captioned "WORK LOOK": behind the espresso machine at Heritage Coffee Co. (exposed brick, a long communal table), signature shirt with sleeves rolled, a canvas barista apron, no hat, pulling a shot, wrist tattoo visible, golden morning light.
- Outfit panel captioned "OPEN MIC LOOK": late in the day, playing a keyboard set up at the end of Heritage Coffee's long communal table with the lamps low. A vintage teal velvet blazer over a cream ribbed tank, the brown corduroy trousers, the bucket hat, rings catching the light, mid-laugh.
- Expressions captioned NEUTRAL, SMILE, SERIOUS, THOUGHTFUL: same head-and-shoulders framing with the bucket hat on. SMILE is an open, playful grin.
- Turnaround captioned FRONT, THREE-QUARTER, SIDE, BACK: signature outfit, bucket hat on, hands relaxed, rings and tattoos visible.
```

- **Avatar:** use §2.1 with `{EXPRESSION}` = "a witty closed-mouth half-smile; bucket hat on, copper curls framing the face, bold graphic liner, septum ring visible".
- **Optional Format A collage** set in Heritage Coffee Co.:
  - First seated panel: at the long communal table with a notebook of chord charts.
  - Second seated panel: relaxed in a worn leather armchair by the window, holding a mug.

### 2.3 Theo Grant

**From the data** (`play56.py` and the save). Theo's creator sheet was made by copying Sol's and changing some fields.
- **Age and identity:** 24, he/him, man.
- **Changed from Sol's sheet:** buzz cut, black hair, stubble, streetwear, forearm-script tattoo, ear piercings, chain necklace, no makeup.
- **Kept from Sol's sheet:**
  - Body: golden-brown skin with a warm undertone, heart-shaped face, almond amber eyes, straight nose, full lips, lean build, 170 cm.
  - Personality: traits creative, outgoing, witty, and Sol's values and goals.
- **Story:** "Left a lot behind in Detroit. Says he's here for a fresh start."
  - He came for a job at Body & Balance, but the gym was still a building site, so he took a job at Greenleaf Market.
  - He was promoted there to Shift Supervisor.
  - The Day 29 script hires him at Body & Balance.

**Data quirk.** Theo's face options are identical to Sol's because his sheet was copied. Draw him as a **different person** who happens to share those creator options, and **do not attach Sol's sheet** as a reference.

**Card title:** THE FRESH START, from his own background line. Alternatives: The New Leaf, The Comeback.

**Palette (art direction):** cobalt blue, heather grey and white; a thin gold chain.

```text
[STYLE BLOCK]
Character model sheet, landscape 3:2, of THEO GRANT, age 24, a young man (he/him) who just moved to Livéra for a fresh start and works at the town's grocery store.

Keep these features identical in every panel: golden-brown skin with a warm undertone; a heart-shaped face; almond-shaped amber eyes; a straight nose; full lips; a black buzz cut; light stubble; no makeup; a lean build, 170 cm tall; a script tattoo on one forearm; small studs in both ears; a thin gold chain necklace.

Palette: cobalt blue, heather grey and white, with a thin gold chain.

Signature outfit (close-up, expressions and turnaround), streetwear: a cobalt-blue zip hoodie open over a plain white heavyweight tee, heather-grey cargo joggers, clean white high-top sneakers with no logos, the thin gold chain.

Panels:
- Large close-up: head and shoulders, one hand rubbing the back of his buzz cut with the forearm-script tattoo visible, an easy, slightly guarded half-smile, warm amber night-city bokeh.
- Name card, text exactly:
  THEO
  GRANT
  THE FRESH START
  Age | 24
  Pronouns | he/him
  Height | 170 cm
  Occupation | Shift Supervisor, Greenleaf Market
  Build | Lean
  Skin Tone | Golden brown, warm
  Eye Color | Amber
  KEY FEATURES: ◆ Black buzz cut and stubble ◆ Almond amber eyes ◆ Heart-shaped face, full lips ◆ Forearm-script tattoo ◆ Pierced ears and a chain necklace ◆ Streetwear
  PERSONALITY: ◆ Creative ◆ Outgoing ◆ Witty
- Outfit panel captioned "WORK LOOK": at a checkout register in Greenleaf Market, a half-stocked grocery with a few empty shelf bays, in morning light. A forest-green market apron over the white tee, a name tag reading "THEO", grey joggers.
- Outfit panel captioned "GYM LOOK" (the fitness job he came to Livéra for): at dawn on Riverside Court, an outdoor basketball court with new nets and old bleachers. A heather-grey training tee, black training shorts, white trainers with no logos, a towel over one shoulder.
- Expressions captioned NEUTRAL, SMILE, SERIOUS, THOUGHTFUL.
- Turnaround captioned FRONT, THREE-QUARTER, SIDE, BACK: signature outfit.
Do not give him copper hair, eyeliner, a septum ring, a bucket hat, vintage clothes, locs, a cap, a silver chain or a red palette.
```

- **Avatar:** use §2.1 with `{EXPRESSION}` = "an easy, slightly guarded half-smile; buzz cut and stubble, gold chain at the collar".
- **Once the recording shows him hired at Body & Balance** (the Day 29 script):
  - Change the card's Occupation to "Front Desk, Body & Balance".
  - Change the work panel to a staff polo at the gym's front desk. The gym has "free weights, a spin room, and a smoothie bar".

### 2.4 Rosa Delgado

**From the data** (`rec2/sheets.py` and the save):
- **Age and identity:** 27, she/her, woman.
- **Skin and face:** olive skin with a warm undertone; oval face; almond-shaped dark-brown eyes; straight nose; full lips.
- **Body:** athletic, 168 cm.
- **Hair and makeup:** black ponytail; natural makeup.
- **Style:** athleisure; wrist tattoo; ear piercings; a watch.
- **Personality:** traits driven, caring, calm. Highest values: community 80, loyalty 75.
- **Story:** "Grew up in San Antonio. Wants to be a police officer in a town small enough that people know her name. Starts at the Livéra Police Academy on day one."
  - She chose "Came to move up", so she started as Assistant Manager at Thread & Co.
  - She signed up for the Founders Five basketball team on Day 24 and adopted Rocky on Day 28.

**Card title:** THE GUARDIAN. Alternatives: The Protector, The Neighbor.

**Palette (art direction):** sage green, white and black; small gold studs.

```text
[STYLE BLOCK]
Character model sheet, landscape 3:2, of ROSA DELGADO, age 27, a woman (she/her) who is assistant manager at Thread & Co., a clothing store, while she trains at the Livéra Police Academy.

Keep these features identical in every panel: olive skin with a warm undertone; an oval face; almond-shaped dark-brown eyes; a straight nose; full lips; natural makeup; long black hair in a sleek high ponytail; an athletic build, 168 cm tall; a small wrist tattoo; pierced ears with small gold studs; a black sport watch.

Palette: sage green, white and black, with small gold studs.

Signature outfit (close-up, expressions and turnaround), athleisure: a fitted sage-green zip-up track jacket over a white fitted tee, black high-waisted leggings, white running shoes with no logos, the black sport watch.

Panels:
- Large close-up: head and shoulders, fingertips resting at her jaw so the wrist tattoo and watch show, a calm, warm closed-mouth smile, steady eyes, warm amber bokeh.
- Name card, text exactly:
  ROSA
  DELGADO
  THE GUARDIAN
  Age | 27
  Pronouns | she/her
  Height | 168 cm
  Occupation | Assistant Manager, Thread & Co.; Police Academy trainee
  Build | Athletic
  Skin Tone | Olive, warm
  Eye Color | Dark brown
  KEY FEATURES: ◆ Sleek black ponytail ◆ Almond dark-brown eyes ◆ Oval face, full lips ◆ Natural makeup ◆ Wrist tattoo and pierced ears ◆ Athleisure and a watch
  PERSONALITY: ◆ Driven ◆ Caring ◆ Calm
- Outfit panel captioned "WORK LOOK": in Thread & Co. (racks of everyday clothes, a mirror wall, a sale bin by the door), folding a stack of sweaters. A black fitted tee, black straight trousers, a lanyard name badge reading "ROSA".
- Outfit panel captioned "ACADEMY LOOK": in the academy classroom at the back of the Livéra Police Station. A navy training polo with a small invented crest reading "LIVÉRA POLICE ACADEMY", khaki training trousers, black boots, a notebook in hand. No real police department insignia and no weapon.
- Expressions captioned NEUTRAL, SMILE, SERIOUS, THOUGHTFUL.
- Turnaround captioned FRONT, THREE-QUARTER, SIDE, BACK: signature athleisure.
```

- **Avatar:** use §2.1 with `{EXPRESSION}` = "a calm, warm closed-mouth smile; ponytail, small gold studs".
- **Only after the recording shows her hired as a Police Officer:** the Day 32 script hires her only if she has graduated, and at the end of Day 28 she had not. Once she is hired:
  - Add an extra panel captioned "OFFICER LOOK": a navy patrol uniform with an invented "LIVÉRA POLICE" shoulder patch and badge design. No real department marks, and no weapon drawn or emphasised.
  - Change the card's Occupation to "Police Officer, Livéra PD".

### 2.5 Kai Morgan

**From the data** (`rec2/sheets.py` and the save):
- **Age and identity:** 22, he/him, man.
- **Skin and face:** deep-brown skin with a neutral undertone; square face; round brown eyes; wide nose; full lips.
- **Body:** lean, 183 cm.
- **Hair:** black locs; stubble.
- **Style:** streetwear; forearm-script and hand tattoos; ear piercings; a chain necklace and a baseball cap.
- **Personality:** traits outgoing, rebellious, creative. Highest value: freedom 80. Goals: get famous, release an album.
- **Story:** "A DJ from Atlanta with a laptop full of beats and not much else. Took the barback job at the Copper Tap because ÉCLAT wasn't hiring yet."
  - On Day 22 he enrolled in a bachelor's at Livéra University.
  - On Day 25 he was hired as a **Beatmaker at Low End Studios**, which is Andre's studio.

**He must not look like Andre Campbell.** Both have locs, a chain and streetwear, and they now work in the same studio. Kai is told apart by:
- the baseball cap and hand tattoos;
- a square face, round eyes and stubble, where Andre has a thin mustache and chin beard;
- a silver chain, where Andre wears a gold Cuban chain and small gold hoops;
- a cherry-red accent, where Andre wears olive;
- no bomber jacket and no taper fade.

**Card title:** THE UPSTART. Alternatives: The Rebel, The Selector.

**Palette (art direction):** cherry red, black and white; silver.

```text
[STYLE BLOCK]
Character model sheet, landscape 3:2, of KAI MORGAN, age 22, a young man (he/him), a DJ and beatmaker newly arrived in Livéra.

Keep these features identical in every panel: deep-brown skin with a neutral undertone; a square face; round brown eyes; a wide nose; full lips; light stubble; black locs falling past his jaw from under a black baseball cap; a lean build, 183 cm tall; a script tattoo on one forearm and tattoos on the back of one hand; small silver studs in both ears; a silver chain necklace.

Palette: cherry red, black and white, with silver.

Signature outfit (close-up, expressions and turnaround), streetwear: an oversized cherry-red hoodie, black baggy denim, red-and-white high-top sneakers with no logos, a plain black baseball cap, the silver chain.

Panels:
- Large close-up: head and shoulders, cap on, a tattooed hand near his chin, a confident, crooked smirk, warm amber night-club bokeh.
- Name card, text exactly:
  KAI
  MORGAN
  THE UPSTART
  Age | 22
  Pronouns | he/him
  Height | 183 cm
  Occupation | Beatmaker, Low End Studios
  Build | Lean
  Skin Tone | Deep brown, neutral
  Eye Color | Brown
  KEY FEATURES: ◆ Black locs and stubble ◆ Round brown eyes, square face ◆ Wide nose, full lips ◆ Forearm-script and hand tattoos ◆ Pierced ears and a chain necklace ◆ Baseball cap and streetwear
  PERSONALITY: ◆ Outgoing ◆ Rebellious ◆ Creative
- Outfit panel captioned "STUDIO LOOK": in Low End Studios (a vintage console, a wall of synths, a couch that has heard every demo). An oversized black tee, black denim, cap worn backwards, headphones around his neck, a laptop and a pad controller in hand.
- Outfit panel captioned "BAR SHIFT LOOK" (his first Livéra job): at The Copper Tap (a long copper bar, a dartboard, a corner stage). A black tee, a bar towel over one shoulder, carrying a rack of clean glasses.
- Expressions captioned NEUTRAL, SMILE, SERIOUS, THOUGHTFUL.
- Turnaround captioned FRONT, THREE-QUARTER, SIDE, BACK: signature outfit, cap on.
Do not give him an olive bomber jacket, a gold Cuban chain, gold hoops, a thin mustache and chin beard, a taper fade, a buzz cut or a cobalt palette.
```

- **Avatar:** use §2.1 with `{EXPRESSION}` = "a confident, crooked smirk; black cap on, locs past the jaw, silver chain".
- **If the art should show him before Day 25:** set the card's Occupation to "Barback, The Copper Tap".

### 2.6 Founding cast: filling the gaps

Their sheets already exist; these prompts add what is missing. For each founder:
- attach **their own sheet** as the identity reference (it is the same person);
- attach the layout sheet the prompt names.

**A. Turnaround and expression sheets.** Nine founders are missing these; only Dax (`dax.jpg`) and Dominique (`dominique.jpg`) have them.

Paste the STYLE BLOCK, then FORMAT C (§1.2), then the prompt below. Attach the founder's own sheet plus `dominique.jpg` for layout, and add "do not copy the bag".

```text
Subject: {FULL NAME}, the same person as in the attached sheet, with the same face, hair, skin, build and jewellery. Turnaround outfit: {OUTFIT}. Keep: {MUST KEEP}. Expressions true to a {ARCHETYPE} personality.
```

| id | Archetype | {OUTFIT} (from data) | {MUST KEEP} (from data) |
|---|---|---|---|
| harper | The Confidante | mustard cardigan, burgundy-and-cream floral blouse, dark straight-leg jeans, cognac ankle boots | oversized red glasses, freckles, shoulder-length auburn curls, gold coin pendant, gold hoops |
| andre | The Wild Card | olive suede bomber, black tank, black cargo pants, olive-and-white sneakers | short locs with a taper fade, thin mustache and chin beard, gold Cuban chain, small gold hoops |
| naomi | The Visionary | oversized black blazer, white tank, high-waisted black wide-leg trousers, black pointed heels | sleek chin-length bob with a side part, winged liner, silver hoops and ear cuffs |
| graham | The Investor | navy merino V-neck over a light-blue collar, charcoal trousers, brown oxfords | dark-blond hair swept back with loose waves, blue-gray eyes, light stubble, leather-strap watch |
| maya | The Idealist | rust satin button-down, cream high-waisted wide-leg trousers, tan pumps | long voluminous defined curls, gold bangles, gold coin pendant, gold hoops |
| julian | The Innovator | black leather jacket, charcoal crewneck sweater, black slim trousers, white sneakers | tousled textured black hair, quick crooked smile, matte black watch |
| leila | The Insider | camel trench coat, black square-neck midi dress, black pointed ankle boots | shoulder-length espresso waves, prominent brows, gold signet ring, gold hoops |
| aaliyah | The Connector | emerald satin blouse, black high-waisted wide-leg trousers, black pointed heels | long voluminous defined curls, gold cuffs and hoops |
| sienna | The Tastemaker | burgundy leather moto jacket, black tank, charcoal high-waisted trousers, black ankle boots | long glossy dark hair with curtain bangs, stacked ear piercings |

Save each as `art/reference/characters/<id>_turnaround.jpg`. In the data it goes under the `reference_sheets` kind `turnaround`.

**B. Dominique's name card.** "The Closer" doesn't appear on any of her art.
- Make a Format A collage set in Meridian Talent Partners, in her work look: "black double-breasted blazer, blush-pink wrap blouse, black wide-leg trousers, black patent pumps, burgundy top-handle bag".
- Attach `dominique_ages.jpg` as the identity reference and add "do not copy the bags or backpack".
- Use a burgundy top-handle bag with plain gold hardware, with no lock and no strap motif.
- The card text comes from her data card. In the recording she was promoted to **Recruiting Manager**; if the owner wants the current title, swap it in.
- There is no Ethnicity row, because her data doesn't state one.

Card text, exactly:

```text
DOMINIQUE ASHFORD / THE CLOSER / Age | 29 / Height | 175 cm / Occupation | Senior Recruiter, Meridian Talent Partners / Build | Curvy hourglass / Skin Tone | Warm medium brown / KEY FEATURES: ◆ Long jet-black body waves ◆ Her grandmother's gold coin pendant ◆ Soft oval face and full lips ◆ Curvy hourglass figure ◆ Black, blush and burgundy; wide-leg trousers always / PERSONALITY: ◆ Driven ◆ Polished ◆ Perceptive
```

Save it as `dominique_collage.jpg`, `reference_sheets` kind `collage`.

**C. Dax's archetype.** Dax's card doesn't show "The Builder". Leave his approved sheet alone; the archetype can appear in the game's interface instead.

**D. Aged looks for everyone.** Use the aging sheet in §3.4.

**E. Only when the game state needs them:**
- **Maternity look:** only once the recording shows a real pregnancy. Dominique's Day 25 test was too early to tell, and the script has her test again on Day 32.
- **Wedding attire:** only after a wedding-outfit item exists in the data. There is none yet. Dominique and Dax married on Day 27; Naomi and Julian's wedding is scripted for Day 34.
- **New work looks:** only after a job change actually happens.

---

## 3. Babies, children and life stages

**What the game does today** (`data/config/life.json`, `data/society/family.json`, `data/society/romance.json`):
- **Ageing.** Adulthood is at 18. One game year is about 5.6 real days.
- **Pregnancy.** It lasts 252 game days, about 4.2 real days. No baby has been born in the recording yet.
- **Name.** A baby takes the last name of the parent who gave birth.
  - A random roll makes it a girl or a boy. That sets she/her or he/him and the gender "girl" or "boy".
  - The first name comes from 10 girl names (Amara, Zoe, Nia, Ivy, Maya, Lena, Sofia, Imani, Ruby, Esme) or 10 boy names (Elijah, Miles, Kai, Theo, Isaiah, Leo, Jonah, Malik, Felix, Omar).
  - Parents can rename the baby within 7 days.
  - A baby named Maya, Kai or Theo is a different person from the resident with that name.
- **Looks.** Babies have **no appearance fields**, so their look must be chosen once and kept (§3.3).
- **Height.** A newborn is 50 cm and grows each birthday toward a generic 172 cm at 18.
- **Care and school.** Under 13, a child must always be supervised. Little Sprouts Daycare takes ages 0–4; Founders School takes ages 5–17.

**Never pretend.**
- Make the stage templates now, but only as style references, saved in `art/templates/life_stages/` and captioned "TEMPLATE". Never show a template as a resident.
- Make a named child's art only after the game records the birth.

### 3.1 FAMILY STYLE BLOCK (use for anyone under 18 and for every family scene)

```text
FAMILY STYLE BLOCK — use only the photography, light and colour rules from the STYLE BLOCK; ignore its fashion and glamour cues. Photoreal, 85mm look, warm golden window light and tungsten lamps, a warm amber grade, but framed like a warm family portrait or a school photo. A natural, age-appropriate look: no makeup emphasis, no fashion or sultry posing, no focus on the body, modest everyday clothes that fit the age, relaxed natural expressions. Children under 13 are always shown with an adult nearby or in a safe place (home, Little Sprouts Daycare, Founders School), never alone in the street. No text except the caption given.
```

### 3.2 Life-stage templates

| Stage (data id) | Ages | Real time in stage | Art |
|---|---|---|---|
| `baby` | 0 | about 5.6 days | newborn and infant, per family |
| `toddler` | 1–3 | about 17 days | per family |
| `child` | 4–12 | about 50 days | per family; must always be supervised |
| `teen` | 13–17 | about 28 days | per family |
| `young_adult` | 18–29 | about 67 days | playable from 18; needs a full adult sheet (§2 format) |
| `adult` | 30–59 | about 168 days | variants for the 40s and 50s |
| `elder` | 60–74 | about 84 days | health declines 1.5× faster |
| `senior` | 75+ | — | health declines 2.5× faster |

**Single-stage prompt.** Paste the STYLE BLOCK, then the FAMILY STYLE BLOCK (for under-18s), then this prompt.
- **For a template:** set the name to "a child" and the caption to `TEMPLATE — {CAPTION}`.
- **For a real child:** use their name and the caption `{FIRST NAME} — {CAPTION}`.

```text
Life-stage reference, portrait 2:3, of {NAME}, {STAGE} (age {AGE}), {PRONOUNS}. Inherited look, chosen once and identical in every image of this person: skin {SKIN_TONE} with a {UNDERTONE} undertone; hair {HAIR_COLOR}, {HAIR_TEXTURE}; eyes {EYE_COLOR}, {EYE_SHAPE}; {OTHER FEATURES}. {STAGE LINE}. One figure on a mottled, painted warm-grey studio backdrop with a soft vignette, and a black caption band at the bottom reading "{CAPTION TEXT}" in tracked champagne-gold serif capitals.
```

**Stage lines.** Use one of these as `{STAGE LINE}`. File names go in `art/templates/life_stages/`.

- **Baby, newborn** (caption `NEWBORN`; file `baby_newborn`): asleep on a cream knit blanket, seen from slightly above, swaddled in an ivory muslin wrap, one tiny hand showing. An adult's hands rest at the edge of the frame.
- **Baby, infant** (caption `BABY`; file `baby_infant`): about 8 months old, sitting propped on a cream rug in a soft cotton romper, reaching for a wooden toy. An adult's knee or hand is at the frame edge.
- **Toddler** (caption `AGE 2`; file `toddler`): standing a little unsteadily, holding an adult's hand that comes in from the frame edge. A soft knit cardigan, cotton trousers, small sneakers, wispy hair.
- **Child, younger** (caption `AGE 6`; file `child_young`): a young Founders School pupil with a backpack, in everyday clothes (a sweater, jeans, sneakers) and a gap-toothed smile, with an adult standing nearby.
- **Child, older** (caption `AGE 10`; file `child_older`): school-photo framing, standing with hands loosely at the sides, in a plain sweater and trousers.
- **Teen** (caption `AGE 15`; file `teen`): everyday casual clothes (a hoodie, jeans, sneakers), a school backpack over one shoulder, a natural expression. No makeup emphasis and no posing.
- **Young adult** (caption `AGE 18`, `AGE 24` and so on): playable from 18, so make a full §2 model sheet. At 18–19, keep it candid with no sultry posing.
- **Adult** (caption `AGE 45` or `AGE 55`; files `adult_40s`, `adult_50s`): the first grey at the temples (more in the 50s variant), fine lines at the eyes, the same signature palette and jewellery, slightly more refined clothes.
- **Elder** (caption `AGE 65`; file `elder`): silver or grey hair (or the stated colour if they dye it), a softer jawline, deeper smile lines, still upright; comfortable tailored clothes in their palette.
- **Senior** (caption `AGE 80`; file `senior`): white or silver hair, a slighter frame, a cardigan or light coat; dignified, warm and still recognisably themselves. No cane, wheelchair or signs of illness unless the game state says so.

### 3.3 Child of two residents

The blend rules below are a **proposal (art direction)**. Write the chosen features down once, at birth, and reuse them at every age.

**Blend rules:**
- **Skin tone.** The creator's 12-step scale is: porcelain, fair, light, light olive, medium, olive, tan, golden brown, medium brown, brown, deep brown, ebony.
  - Pick a step between the two parents' tones, or the shared tone if they match.
  - The undertone comes from either parent.
- **Hair.** Texture leans toward the curlier parent; colour comes from either parent. In infancy the hair is finer and darker, and may be only wisps.
- **Eyes.** Colour and shape come from one parent. From toddler age on, keep that adult eye colour.
- **Face.** Soft and round for babies and toddlers. From the child stage on, take the face shape from one parent, the nose from one and the lips from one.
- **Height.** Draw the height the game gives (see the facts at the top of §3).

**Founding parents.** The founders' looks are free text in the data. The table gives the data wording, with the nearest creator option after the arrow. These are for art direction only. Where the data doesn't state a colour, read it off their sheet.

| Founder | Skin | Hair | Eyes |
|---|---|---|---|
| Dominique | warm medium brown → medium brown, warm | long jet-black body waves | not stated |
| Dax | medium brown | short waves with a crisp lineup; colour not stated | not stated |
| Harper | light brown with freckles → medium or tan | shoulder-length auburn curls | green-hazel → hazel or green |
| Andre | warm mahogany → brown or deep brown, warm | short locs with a taper fade; colour not stated | expressive brown → brown |
| Naomi | light caramel → tan or golden brown | sleek chin-length bob; colour not stated | almond-shaped; colour not stated |
| Graham | fair | dark blond, swept back with loose waves | blue-gray → gray or blue |
| Maya | medium golden-brown, warm → golden brown, warm | long, voluminous defined curls; colour not stated | large, expressive; colour not stated |
| Julian | fair with warm undertones → fair, warm | textured black hair | dark → dark brown |
| Leila | olive | shoulder-length espresso waves → dark brown | deep brown, almond → dark brown |
| Aaliyah | deep golden-brown, warm → golden brown or brown, warm | long, voluminous defined curls; colour not stated | dark → dark brown |
| Sienna | light caramel → tan or golden brown | long, glossy dark hair, straight, curtain bangs | almond-shaped, dark → dark brown |

Residents made in the creator already have exact fields (§2).

```text
[STYLE BLOCK] + [FAMILY STYLE BLOCK]
Attach both parents' LIVÉRA sheets as identity references for inherited features only, not for clothing or pose.
Portrait of {FIRST NAME} {BIRTH PARENT'S LAST NAME}, {STAGE} (age {AGE}), {she/her or he/him}, the child of {PARENT A} and {PARENT B}.
Inherited look, fixed for life: skin {chosen step}, {undertone} undertone (between {A's tone} and {B's tone}); hair {colour from A or B}, {texture leaning to the curlier parent}; eyes {colour and shape from A or B}; at this age the face is {soft and round | face shape from A, nose from B, lips from A}.
{STAGE LINE from 3.2}. Caption "{FIRST NAME} — {CAPTION}".
The child should look like a believable mix of both parents, not a copy of either.
```

**Worked example (hypothetical; don't generate it until a birth is recorded).** Dominique and Dax are married. Dominique would carry the baby, so the child's last name would be Ashford.
- **Skin:** both are medium brown, so medium brown with a warm undertone.
- **Hair (art direction):** black, wavy to loosely curly.
- **Eyes (art direction, since neither parent's eye colour is stated):** brown, almond.

Once a child is born, also make a §2.1 avatar with the FAMILY STYLE BLOCK.

### 3.4 Life-stages sheet and aging sheet (Format D)

**Life-stages sheet:** one person at several past ages, like `dominique_ages.jpg`. Paste the STYLE BLOCK, the FORMAT D swap, and then:

```text
Subject: {FULL NAME}. Attach their sheet as the identity reference; the face must be clearly the same person at every age. Panels, left to right:
1. "{FIRST} — AGE {A}": {hair}, {outfit}, carrying {item}, wearing {jewellery}.
2. "{FIRST} — AGE {B}": ...
3. "{FIRST} — AGE {C}": ... (their current look).
Keep {SIGNATURE DETAIL, e.g. the gold coin pendant} in every panel.
```

- **Write the stages into the data first.** Content is data, so each panel should match an entry in the character's `profile.life_stages`: age, stage, chapter and look (hair, outfit, carrying, jewelry). Only Dominique has these entries so far.
- Panels under 18 use the FAMILY STYLE BLOCK.
- Save as `art/reference/characters/<id>_ages.jpg`, `reference_sheets` kind `life_stages`.

**Aging sheet:** future looks, needed because everyone ages fast. Use FORMAT D with 4 panels captioned `{FIRST} — AGE 40`, `AGE 50`, `AGE 65` and `AGE 80`:

```text
Subject: {FULL NAME} as they will look in later life. Attach their sheet as the identity reference. Keep the face structure, eye colour, signature palette and signature details (e.g. Harper's red glasses, Dominique's coin pendant, Dax's eyebrow scar) in every panel. AGE 40: the first fine lines, current style slightly more refined. AGE 50: grey at the temples, the face fuller or leaner, true to their build. AGE 65 (elder): silver hair, deeper smile lines, upright, tailored comfort in their palette. AGE 80 (senior): white or silver hair, a slighter frame, warm and dignified; no illness cues.
```

Save as `art/reference/characters/<id>_aging.jpg`, `reference_sheets` kind `aging`. For a created resident, use `art/reference/residents/<id>_aging.jpg`.

---

## 4. Pets

**From `data/society/pets.json`:**
- **Species, fees and breeds:** dog $250 (8 breeds), cat $150 (7 breeds), rabbit $80 (6 breeds).
- **Stages:** each species has three, so there are 21 breeds × 3 = 63 possible looks.
- **Age:** pet ages are counted in game months of 28 days.
- **Places:**
  - The shelter is Paws & Whiskers Adoption Center: "Dogs, cats and a very opinionated rabbit, all looking for homes."
  - The vet is Founders Animal Hospital.
- **Coat colours are not in the data.** For each adopted pet, pick one colour typical of the breed and write it down so it never changes.

### 4.1 PET BLOCK

```text
PET BLOCK — same LIVÉRA photography as the STYLE BLOCK: photoreal, 85mm look, shallow depth of field, warm golden window light and tungsten lamps, a warm amber grade, natural fur texture and no anthropomorphism. The animal is healthy, clean and calm. No people's faces in frame (an owner's hand at the edge is fine). No text except the caption given.
```

**Breed sheet layout:** one sheet per breed. Use the FORMAT D swap with 3 panels, captioned "{BREED} — {STAGE}". Save as `art/pets/<species>/<breed_slug>.jpg`, for example `art/pets/dog/terrier_mix.jpg`.

### 4.2 Dog

```text
[PET BLOCK] + [FORMAT D, 3 panels]
A {BREED} dog with a {COAT COLOUR} coat at three life stages, the same individual in every panel:
"{BREED} — PUPPY" (0–11 months): oversized paws, soft fluffy coat, curious head tilt, sitting.
"{BREED} — ADULT" (12–83 months, 1 to 6 years): standing alert in a natural stance, glossy coat.
"{BREED} — SENIOR" (84+ months, 7 years and up): grey muzzle, softer eyes, lying down contentedly.
```

`{BREED}` options: Labrador mix · Beagle · Pit bull mix · Border collie · Dachshund · German shepherd mix · Terrier mix · Greyhound.

### 4.3 Cat

```text
[PET BLOCK] + [FORMAT D, 3 panels]
A {BREED} cat with {COAT / MARKINGS}, the same individual in every panel:
"{BREED} — KITTEN" (0–11 months): big ears and eyes, fluffy, playful crouch.
"{BREED} — ADULT" (12–119 months, 1 to 9 years): sitting upright with the tail wrapped around the paws, sleek coat.
"{BREED} — SENIOR" (120+ months, 10 years and up): a slightly leaner frame, a few grey hairs, curled up in a warm patch of sunlight.
```

`{BREED}` options: Domestic shorthair · Tabby · Maine Coon mix · Siamese mix · Tuxedo · Calico · Russian Blue mix.

### 4.4 Rabbit

```text
[PET BLOCK] + [FORMAT D, 3 panels]
A {BREED} rabbit with {COAT COLOUR}, the same individual in every panel:
"{BREED} — KIT" (0–5 months): tiny, round, soft, ears not yet full size.
"{BREED} — ADULT" (6–59 months): sitting up alert, full coat.
"{BREED} — SENIOR" (60+ months, 5 years and up): calm, loafing on a soft blanket.
```

`{BREED}` options: Holland Lop · Netherland Dwarf · Rex · Lionhead · Flemish Giant mix · Dutch.

### 4.5 Pets that exist in the recording

Use the PET BLOCK for a square 1:1 portrait with the pet's face centred, sized for a circular crop. Save to `art/pets/named/<owner id>_<pet name>.jpg`. Names can repeat between pets, so the owner's id keeps each file unique.

- **Pepper** (`harper_pepper.jpg`)
  - Who: Harper's dog, a Terrier mix. Adult; 4 years 3 months when adopted on Day 7.
  - Setting: at home at 3 Founders Row, "a brick townhouse full of plants, books and mismatched armchairs". Sitting on a rug by an armchair.
- **Shadow** (`leila_shadow.jpg`)
  - Who: Leila's cat, a Maine Coon mix. Adult; 4 years 9 months when adopted on Day 9.
  - Setting: at 7 Founders Row, "a narrow townhouse with blackout curtains and a desk buried in files". Lounging on the files in a sliver of lamplight.
- **Bramble** (`aaliyah_bramble.jpg`)
  - Who: Aaliyah's rabbit, a Dutch. Adult; about 2 years 3 months when adopted on Day 22.
  - Setting: at home in Lakeview Condos, Unit 1A, "a new two-bedroom condo with a balcony over Willow Lake". On a soft blanket by the balcony door.
- **Rocky** (`rosa-delgado_rocky.jpg`)
  - Who: Rosa's dog, a Beagle, adopted on Day 28. Adult; 6 years 11 months when adopted, so he turns senior (84 months) around Day 52.
  - Setting: at Maple Court, Unit 3B, "thin walls, good light, and the smell of fresh paint". Sitting by the door with a leash.
  - Make a senior version only once the game shows him as senior.

**Pet icons** use the ICON BLOCK (§5.1) and are saved to `art/icons/pets/<id>.png`:
- **Actions:** `feed`, `play`, `cuddle`, `groom`, `walk` (dogs only).
- **Vet services:** `checkup`, `vaccines`, `treatment`.
- **Illnesses:** `ear_infection`, `upset_stomach`, `kennel_cough`, `cat_flu`, `snuffles`.

---

## 5. Pictures for things

### 5.1 Framing blocks

Paste one of these after the STYLE BLOCK.

**OBJECT BLOCK** (items, food, drink, coin packs)

```text
OBJECT BLOCK — studio product photograph in the LIVÉRA house light: a single {OBJECT} centred, in a three-quarter view from slightly above (about 30°), filling about 70% of a square frame, with a warm key light from the upper left, a soft amber rim light and a gentle contact shadow. Transparent background (if transparency isn't possible: a plain seamless warm-ivory #F3ECE2 background with nothing else in frame). Photoreal, no hands, no people, no text except the in-game wording given, no real brand logos.
```

**ICON BLOCK** (status, needs, emotions, services and other small interface icons)

```text
ICON BLOCK — flat, minimal line icon: one champagne-gold (#cfb991) glyph with ivory (#f0dcc0) highlights, the same stroke weight across the whole set (about 24 px at 512 px), rounded line ends, centred with 12% padding on a transparent background. Elegant and simple, readable at 32 px. No text, no letters, no drop shadow.
```

**APP ICON BLOCK** (the 26 phone apps)

```text
APP ICON BLOCK — square app icon: a rounded-square tile (corner radius about 22%) in warm near-black lacquer (#0a0a09) with a faint warm inner glow, and one centred glyph in champagne gold (#cfb991 to #f0dcc0) in the same line style as the whole set. No text, no letters. It must not resemble any real app's icon.
```

**BUILDING BLOCK** (exteriors)

```text
BUILDING BLOCK — architectural exterior photograph of one building in LIVÉRA, a young American river town being built right now: glass towers Downtown; brick, new construction and saplings elsewhere. Three-quarter view from across the street at eye level (about 1.6 m), 35mm lens, the whole building in frame with some sky and pavement, at golden hour with the sun low from the left, warm amber light and long soft shadows, in the same warm cinematic grade as the character sheets. Signage reads exactly: "{SIGN TEXT}". Empty street: no people and no cars (the game has no driving). No real brands or chains. Landscape 3:2.
```

**Map sprite variant.** If you build a top-down or isometric browser client, add this to any building prompt:

```text
Also: the same building as a game-map sprite, isometric 2:1 view from the south-east, the whole lot on a transparent background, with the same materials and signage and soft warm daylight. No people, no vehicles.
```

### 5.2 Items (OBJECT BLOCK)

Save as `art/items/<item_id>.png`; the id is the first column of each table. When a shop sells an item (Thread & Co., Circuit Electronics, Lustre Jewelers, Ellis Atelier, the pharmacy and so on), the shop uses the item's picture.

**Phones and cases.** Lyra is the in-game phone maker. The design below is art direction:
- **Shape:** a slim rounded slab with one vertical pill-shaped camera strip and a small engraved lyre glyph in the centre of the back.
- **Show both sides** in a three-quarter view: the back, and the screen lit with a simple warm-gradient lock screen and no real interface.
- **Not like any real phone:** no square camera bump and no real maker's logo.

| id | Prompt |
|---|---|
| `lyra_one` | Lyra One, the basic phone everyone is issued: matte charcoal finish, one lens in the pill strip. |
| `lyra_air` | Lyra Air: ultra-thin, pale champagne aluminium, two lenses. |
| `lyra_pro` | Lyra Pro: graphite titanium, three lenses in the pill strip. |
| `lyra_pro_gold` | Lyra Pro Gold Edition: the Pro in polished champagne gold with a fine engraved lyre (coin-shop item). |
| `case_clear` | Clear phone case on a charcoal Lyra phone. |
| `case_marble` | White-and-grey marble-pattern phone case (coin-shop item). |
| `case_glitter` | Phone case with rose-gold glitter suspended in clear resin (coin-shop item). |
| `case_gold_leaf` | Black phone case with flakes of gold leaf (coin-shop item). |

**Outfits.** Show each on an invisible "ghost" mannequin, front view, unbranded and gender-neutral where possible.

| id | Prompt |
|---|---|
| `everyday_outfit` | A soft cream knit tee, mid-wash straight jeans, white canvas sneakers. |
| `streetwear_set` | An oversized heather-grey hoodie and matching joggers, unbranded. |
| `workwear_suit` | A charcoal tailored two-piece suit with a crisp white shirt. |
| `evening_outfit` | A black satin evening set: a satin-lapel jacket and wide trousers. |
| `gym_clothes` | A black training tee, grey shorts, white trainers. |
| `tailored_blazer` | Ellis Atelier tailored blazer: an oversized black blazer with sharp shoulders and ivory lining, with a small woven "ELLIS ATELIER" label showing. |
| `atelier_nuit_gown` | Atelier Nuit couture gown on a dress form: midnight-blue silk with sculpted draping (coin-shop item). |
| `midnight_couture_suit` | Midnight couture suit: a midnight-blue velvet tuxedo with satin lapels (coin-shop item). |
| `velour_tracksuit` | Velour designer tracksuit in champagne velour, with no wording or logos anywhere (coin-shop item). |

**Wearable accessories and jewellery.**

| id | Prompt |
|---|---|
| `silk_scarf` | Ellis Atelier silk scarf, folded square: a black-and-ivory abstract brushstroke print, a thin gold border, a tiny printed "ELLIS ATELIER" signature along one edge. |
| `sunglasses` | Classic black acetate sunglasses. |
| `designer_bag` | A structured top-handle bag in cognac leather with minimal plain gold hardware. No monogram, no lock, no strap motif resembling any real fashion house. |
| `gold_watch` | A round gold watch with an ivory dial and a slim gold bracelet. |
| `engagement_ring` | A gold solitaire engagement ring in an open black velvet ring box with "LUSTRE" embossed in gold on the lid. |
| `smartwatch` | A rounded-square smartwatch with a graphite band; the screen shows a simple gold heart-rate line. |
| `riviera_sunglasses` | Riviera designer sunglasses: oversized tortoiseshell with thin gold temples and a tiny engraved "RIVIERA" (coin-shop item). |
| `meridian_chronograph` | Meridian luxury chronograph: steel and champagne gold, a black dial with three subdials, "MERIDIAN" engraved; not resembling any real watch model (coin-shop item). |

**Other gear.**

| id | Prompt |
|---|---|
| `umbrella` | A closed black umbrella with a wooden J-handle and a thin gold tip. |
| `laptop` | An unbranded silver laptop, half open, the screen glowing warm, no logo. |
| `headphones` | Over-ear wireless headphones in matte cream with cognac leather cushions. |

**Medicine** (sold at Riverdale Pharmacy):
- Show sealed packaging only, with a simple clinical label reading "Riverdale Pharmacy" plus the wording given.
- No loose pills and no real drug or brand names.

| id | Prompt |
|---|---|
| `cold_medicine` | A box labelled "COLD & FLU RELIEF". |
| `painkillers` | A small white box labelled "PAINKILLERS". |
| `antidepressants` | An amber prescription bottle labelled "Riverdale Pharmacy · 30-DAY SUPPLY". |
| `allergy_relief` | A box labelled "ALLERGY RELIEF · 10". |
| `antacid` | A box labelled "ANTACID TABLETS · 12". |
| `sleep_aid` | A soft-lavender box labelled "SLEEP AID · 8". |
| `vitamins` | A white bottle labelled "DAILY VITAMINS · 30". |
| `antibiotics` | An amber prescription bottle labelled "Riverdale Pharmacy · 6 DOSES". |
| `antivirals` | An amber prescription bottle labelled "Riverdale Pharmacy · 4 DOSES". |

**Health** (sold at Greenleaf Market and Riverdale Pharmacy).

| id | Prompt |
|---|---|
| `condoms` | A small, discreet box labelled "CONDOMS · 3", plain packaging, nothing explicit. |
| `pregnancy_test` | A closed retail box labelled "PREGNANCY TEST"; no result window shown. |

**Fictional illegal drugs** (sold at The Underpass). Keep them clearly fictional:
- Show only abstract, sealed game tokens.
- No powders, pills, crystals, leaves, smoke, needles or pipes, and nobody using them.
- They must not look like any real drug.

| id | Prompt |
|---|---|
| `glint` | A tiny sealed sachet in silver-holographic foil with a small starburst glyph. |
| `haze` | A small frosted lavender glass vial with a wax seal; contents not visible. |
| `velvet` | A small closed drawstring pouch in deep-red velvet. |

**Food and pet supplies.**

| id | Prompt |
|---|---|
| `birthday_cake` | A round single-layer cake with ivory buttercream, gold sprinkles and lit candles. |
| `pet_food` | A kraft-paper bag of pet food labelled "PET FOOD · 5 MEALS" with a simple paw glyph (item from `data/society/pets.json`). |

**Coin packs.** Save as `art/items/coins/<product_id>.png`. The coins (art direction) are champagne gold with an engraved art-deco "L".

| product_id | Prompt |
|---|---|
| `livera.coins.100` | Handful of coins: a small pile of about six coins. |
| `livera.coins.550` | Pouch of coins: a black velvet pouch spilling coins. |
| `livera.coins.1200` | Purse of coins: a small structured purse with a gold clasp, full of coins. |
| `livera.coins.2500` | Chest of coins: a small black-lacquer chest overflowing with coins. |
| `livera.coins.6500` | Vault of coins: a round vault door ajar, with stacks of coins inside. |

### 5.3 Food, drink and gifts bought on the spot (OBJECT BLOCK)

Save as `art/offers/<location_id>__<offer_id>.png`, with a double underscore. The location is in the file name because the same offer id can be sold at two places: `cocktail` and `wine` both are.

| Location | Offer | Prompt |
|---|---|---|
| `heritage_coffee` | `drip` | A white stoneware mug of black drip coffee. |
| `heritage_coffee` | `latte` | An oat milk latte with rosetta latte art in a ceramic cup. |
| `heritage_coffee` | `croissant` | An almond croissant dusted with sugar and flaked almonds. |
| `heritage_coffee` | `breakfast_sandwich` | An egg-and-cheese breakfast sandwich on brioche, in brown paper. |
| `james_wellness` | `herbal_tea` | A clear glass cup of herbal tea with a sprig of mint. |
| `greenleaf_market` | `ready_meal` | A grain bowl in a kraft container with a green "GREENLEAF MARKET" band. |
| `greenleaf_market` | `fresh_juice` | A glass bottle of cold-pressed green juice with a leaf label. |
| `greenleaf_market` | `flowers` | A bouquet of mixed flowers wrapped in kraft paper with a cream ribbon (it is a gift). |
| `body_balance` | `smoothie` | A protein smoothie in a clear lidded cup. |
| `eclat` | `cocktail` | ÉCLAT signature cocktail: a coupe glass of champagne-gold drink with a gold rim. |
| `copper_tap` | `cocktail` | House cocktail served in a copper mug with lime. |
| `copper_tap` | `beer` | A pint of amber draft beer. |
| `copper_tap` | `wine` | A glass of red wine. |
| `copper_tap` | `bar_snacks` | A small bowl of nuts and pretzels. |
| `copper_tap` | `soda` | A tall glass of soda with ice and lime. |
| `livera_university` | `campus_coffee` | A paper cup with a cream "LIVÉRA UNIVERSITY" sleeve. |
| `willow_lake_park` | `picnic` | A wicker picnic basket with a gingham cloth. |
| `lumiere_bistro` | `dinner` | A plated French bistro main course (part of the three-course dinner), lit warmly as if by candlelight. |
| `lumiere_bistro` | `dessert` | Crème brûlée in a ramekin with cracked caramel. |
| `lumiere_bistro` | `wine` | A glass of red Bordeaux. |
| `starlight_cinema` | `popcorn` | Buttered popcorn in a red box with a gold star. |
| `riverside_clubhouse` | `sports_drink` | A sports-drink bottle with a blank wave label. |

### 5.4 Services (ICON BLOCK)

Save as `art/icons/services/<offer_id>.png`.

| offer_id | Icon |
|---|---|
| `therapy_session` | two armchairs facing each other |
| `yoga_class` | a rolled yoga mat |
| `studio_hour` | headphones over a sound wave |
| `checkup` | a stethoscope |
| `treatment` | a bandage cross |
| `dental_care` | a tooth |
| `sti_test` | a test tube with a small shield |
| `prenatal` | a heart with a tiny heartbeat line |
| `abortion` | a closed door with a small privacy shield; neutral |
| `emergency_care` | a cross with a clock |
| `rehab` | a sunrise over a sprout |
| `offering` | an offering envelope |
| `day_pass` | a dumbbell |
| `cover` | velvet-rope posts |
| `haircut` | scissors |
| `shave` | a straight razor |
| `manicure` | a nail polish bottle |
| `facial` | a face outline with a leaf |
| `rowboat` | crossed oars |
| `movie_ticket` | a ticket stub |

### 5.5 Buildings and places (BUILDING BLOCK)

There are 71 locations in 9 districts.

**District look (art direction):**
- **Downtown:** glass and new towers.
- **Riverside:** the river, lofts and the campus.
- **Founders Way:** the main shopping street.
- **Maple Court:** starter blocks, the church and the community centre.
- **Willow Lane:** houses and the lake.
- **Civic Row:** civic buildings.
- **Founders Row:** brick townhouses.
- **South Works:** the construction yard.
- **Forge yard:** the overpass.

**One line per building.** Each line is: id | sign text | type and district | quoted description from the data (shortened) | art direction.
- Paste the BUILDING BLOCK, set `{SIGN TEXT}` to the name, then add the line.
- Save as `art/places/<location_id>.jpg`.

```text
james_wellness | JAMES WELLNESS | wellness studio, Downtown | "warm lamps, deep leather chairs, a yoga room upstairs" | two-storey glass-fronted studio, warm lamplight inside, a simple lotus mark beside the name (as on Harper's sheet), potted palms at the door.
low_end_studios | LOW END STUDIOS | recording studio, Riverside | "a vintage console, a wall of synths, and a couch that has heard every demo in town" | converted brick warehouse by the river, a small lit sign, a glimpse of the console through one window.
ellis_atelier | ELLIS ATELIER | boutique and atelier, Downtown | "mood boards, black-and-white lookbooks, and one rail of finished pieces" | narrow black-framed shopfront, one rail of black garments visible, a minimal ivory serif name.
whitaker_capital | WHITAKER CAPITAL | office, Civic Row | "glass, walnut, and a model of the city as it will look in ten years" | glass office with a walnut-lined lobby, an architectural model visible inside.
common_ground | COMMON GROUND COMMUNITY CENTER | community centre, Maple Court | "free dinners, tutoring, a legal clinic on Thursdays" | friendly brick building, a hand-painted noticeboard, warm light in big windows.
parallax_labs | PARALLAX LABS | tech office, Downtown | "standing desks, a whiteboard wall, cold brew on tap" | modern glass floor in a new tower, a whiteboard wall glowing through the glass.
livera_ledger | THE LIVÉRA LEDGER | newsroom, Civic Row | "four desks, a police scanner, and Leila Rahal's corkboard of red string" | small storefront newsroom, gold-leaf lettering on the window.
baptiste_events | BAPTISTE & CO. EVENTS | event agency, Downtown | "swatches, seating charts, and the guest list for every opening in town" | elegant ground-floor studio, white flowers in the window.
lumen_creative | LUMEN CREATIVE | creative agency, Downtown | "the agency branding Livéra itself" | open-plan studio behind tall glass, a lit wordmark.
meridian_talent | MERIDIAN TALENT PARTNERS | recruiting office, Downtown | "a recruiting firm's new Livéra office" | fresh glass-and-stone office entrance, brushed-gold lettering.
heritage_coffee | HERITAGE COFFEE CO. | café, Downtown | "exposed brick, a long communal table, and the only espresso machine in town" | brick corner café, big windows showing the communal table, a chalkboard by the door announcing the open mic.
greenleaf_market | GREENLEAF MARKET | grocery, Downtown | "still half-stocked while the distribution road is being paved" | new grocery with a green awning, some shelves visibly empty through the windows.
forge_site_office | FORGE BUILDERS SITE OFFICE | construction office, South Works | "two stacked trailers, a plan table, and a whiteboard of every build in town" | two stacked site trailers, a temporary fence, plans visible through a window.
riverdale_clinic | RIVERDALE CLINIC | walk-in clinic, Downtown | "a walk-in clinic that will become Riverdale Medical Center" | clean single-storey clinic with a simple cross symbol.
livera_general | LIVÉRA GENERAL HOSPITAL | hospital, Riverside | "emergency room open around the clock, a maternity ward, and a parking lot still mostly gravel" | new hospital with a lit EMERGENCY entrance and an empty gravel lot.
greater_hope | GREATER HOPE MISSIONARY BAPTIST CHURCH | church, Maple Court | "Sunday service, a choir, and a kitchen that feeds whoever shows up" | modest brick church with a white steeple and open double doors.
police_station | LIVÉRA POLICE STATION | civic, Civic Row | "a front desk, three holding cells, and the academy classroom in back" | civic brick building with flagpoles and an invented "LIVÉRA POLICE" crest. No real department marks.
fire_station | STATION 1 FIRE & RESCUE | civic placeholder landmark, Civic Row | "Landmark only for now: civic services arrive in a later milestone" | a closed engine-bay door, no trucks and no crew. The data already marks it as a placeholder; never present it as a working fire station.
thread_co | THREAD & CO. | clothing store, Founders Way | "racks of everyday clothes, a mirror wall, and a sale bin by the door" | friendly shopfront, racks and a SALE bin at the entrance.
circuit_electronics | CIRCUIT ELECTRONICS | electronics store, Founders Way | "demo laptops chained to white tables, a wall of headphones" | bright white interior visible through glass, unbranded devices.
riverdale_pharmacy | RIVERDALE PHARMACY | pharmacy, Founders Way | "fluorescent aisles, a prescription counter in the back" | pharmacy shopfront with a simple green cross.
lustre_jewelers | LUSTRE JEWELERS | jeweller, Downtown | "glass cases, soft lighting, and a velvet tray" | black-and-gold storefront with softly lit glass cases.
fade_glow | FADE & GLOW SALON | salon, Founders Way | "three barber chairs, two stylists, a nail station" | salon window showing three barber chairs; a striped pole drawn in gold and black.
livera_university | LIVÉRA UNIVERSITY | university, Riverside | "one finished lecture hall, a library that smells of fresh paint, and a law clinic upstairs" | new campus building on the river, a young lawn, one hall finished and others still framed.
hale_partners | HALE & PARTNERS | law firm, Downtown | "glass conference room, a library of statute books nobody reads" | discreet entrance to a glass conference room, brass nameplate.
copper_tap | THE COPPER TAP | bar, Founders Way | "a long copper bar, a dartboard nobody hits, and a corner stage" | warm-lit pub front with copper trim and the bar glowing inside.
the_underpass | (no sign: set {SIGN TEXT} to nothing) | street corner, Forge yard | "under the half-built overpass by the Forge yard" | an empty corner under raw concrete overpass beams at dusk; no people and no drugs shown.
founders_school | FOUNDERS SCHOOL | K–12 school, Downtown | "one long brick building, with a gym that doubles as the auditorium" | long brick school with a flagpole, empty at golden hour.
little_sprouts | LITTLE SPROUTS DAYCARE | daycare, Downtown | "a bright daycare for babies and toddlers" | bright, colourful but tasteful entrance with a small fenced play yard, empty.
suds_spin | SUDS & SPIN LAUNDROMAT | laundromat, Founders Way | "twelve washers, eight dryers, a change machine and a bench" | rows of machines through the window, one bench.
lumiere_bistro | LUMIÈRE BISTRO | restaurant, Founders Way | "candles, a short French menu… the town's date-night spot" | small bistro with an awning, candlelit tables through the glass, at dusk.
starlight_cinema | STARLIGHT CINEMA | cinema, Founders Way | "two screens, red velvet seats and real butter on the popcorn" | marquee with warm bulbs, red-velvet tones in the lobby.
riverside_field | RIVERSIDE FIELD | sports field, Riverside | "a floodlit grass pitch by the river… with a small grandstand" | empty pitch under floodlights at dusk.
riverside_court | RIVERSIDE COURT | basketball court, Riverside | "an outdoor basketball court with new nets and old bleachers" | empty court at golden hour.
riverside_clubhouse | RIVERSIDE CLUBHOUSE | clubhouse, Riverside | "locker rooms, a trophy shelf with nothing on it yet, and the league office upstairs" | small two-storey clubhouse beside the field.
paws_whiskers | PAWS & WHISKERS ADOPTION CENTER | animal shelter, Founders Way | "dogs, cats and a very opinionated rabbit, all looking for homes" | cheerful shelter front, a paw-print mark, a rabbit visible in a window.
founders_animal_hospital | FOUNDERS ANIMAL HOSPITAL | vet, Founders Way | "checkups, shots and the occasional swallowed sock. Open late for emergencies" | clean vet clinic with a paw-and-cross mark and a lit door.
founders_park | FOUNDERS PARK | park, Downtown | "new saplings, a fountain that isn't switched on yet, and a view of the river" | a small green with a dry fountain and staked young trees.
willow_lake_park | WILLOW LAKE PARK | park, Willow Lane | "a small lake ringed by willows, with a boardwalk, picnic lawns and rowboats for rent" | boardwalk and rowboats tied up at a small boathouse, at golden hour.
```

**Homes.** The data has no id for a whole building, so these files are named by building: `lexington.jpg`, `maple_court.jpg`, `riverside_lofts.jpg`, `founders_row_3.jpg`, `founders_row_7.jpg`, `willow_lane_house.jpg`, `lakeview_condos.jpg`.

```text
lexington | THE LEXINGTON | luxury apartment tower, Downtown | "the town's first luxury tower. Floor-to-ceiling windows over the construction cranes"; the penthouse has "a terrace over the river" | slim glass tower with a lit lobby, cranes in the background.
maple_court | MAPLE COURT | starter apartment block, Maple Court | "the first finished block of Maple Court. Thin walls, good light, and the smell of fresh paint" | new four-storey brick-and-render block with small balconies.
riverside_lofts | RIVERSIDE LOFTS | loft building, Riverside | (the data describes only the units) | art direction: a converted brick warehouse by the river with big steel windows.
founders_row_3 | 3 FOUNDERS ROW | townhouse, Founders Row | "a brick townhouse full of plants, books and mismatched armchairs" | plants on the stoop, books visible in the window.
founders_row_7 | 7 FOUNDERS ROW | townhouse, Founders Row | "a narrow townhouse with blackout curtains and a desk buried in files" | narrow facade, blackout curtains drawn.
willow_lane_house | (no sign; a house number on the porch: 2, 4, 6 or 8) | detached house, Willow Lane | "a detached family house with a porch and a back yard, a short walk from the lake" | modest porch house with a young tree; make #2, #4, #6 and #8 as colour variants if wanted.
lakeview_condos | LAKEVIEW CONDOS | condos, Willow Lane | "a new two-bedroom condo with a balcony over Willow Lake" | low-rise condo block with balconies facing the lake.
```

**Interiors.** Add this after the STYLE BLOCK:

```text
Interior photograph, 3:2, wide 24mm, eye level, golden-hour window light and warm lamps. No people.
```

Save as `art/places/interiors/<location_id>.jpg`. Use the data description for each:
- `lexington_1204`: a corner one-bedroom on the twelfth floor, cranes outside.
- `lexington_1801`: a corner one-bedroom with a dress form by the window and fabric swatches on every surface.
- `lexington_0904`: fresh flowers, a closet sorted by colour, a calendar booked solid.
- `lexington_ph1`: three bedrooms, a terrace over the river, very little furniture yet.
- `lexington_0807` and `lexington_1502`: a one-bedroom with a view of the cranes (one image covers both).
- `maple_court_1a`: a ground-floor one-bedroom, two blocks from Common Ground.
- `maple_court_3b`: a starter apartment, "thin walls, good light, and the smell of fresh paint" (Rosa's home).
- `maple_court_one_bedroom` (generic): "bare walls, good light, room to make it yours". This covers 2A, 2B, 4A and 4C.
- `riverside_lofts_2`: an open loft with a keyboard in the kitchen and a view of where ÉCLAT is going up.
- `riverside_lofts_3`: "a loft of concrete, linen and one perfect lamp".
- `riverside_lofts_5`: three monitors, a pull-up bar and an unopened box of plates.
- `founders_row_3` and `founders_row_7`: as in the homes list above.
- `willow_lane_house` and `lakeview_condo` (generic): from their descriptions above.

**Generic templates by place type** (for future places). Save as `art/places/types/<type>.jpg`.

```text
apartment_building: a new mid-rise residential block, brick and render, small balconies, a lit lobby.
house: a detached family house with a porch and a back yard.
condo: a low-rise condo block with balconies.
townhouse: a narrow brick townhouse in a row.
office / tech_office: a glass-fronted office floor in a new tower, the company name in brushed gold.
shop (clothing_store, electronics_store, jeweler, pharmacy, boutique, grocery): a ground-floor shopfront with an awning or a clean fascia and big display windows.
restaurant / bar / coffee_shop: a warm-lit frontage at dusk, tables visible through the glass.
civic: a dignified brick or stone civic building with flagpoles and an invented crest.
park: a green with young trees, paths and benches, empty.
construction_site: a fenced lot with framing, a crane, lumber stacks and graders, with no workers shown.
any other type: the BUILDING BLOCK plus one sentence from the place's data description.
```

**Building sites and finished buildings.** Shoot both images from the same camera position. Show the finished image in the game only once the game shows that project complete.

| Site file | Finished file | Site | Finished |
|---|---|---|---|
| `founders_way_site.jpg` | `founders_way_site_done.jpg` | "the dirt road that will become the town's main boulevard. Graders and a paving crew" (show the machines only, no crew) | a freshly paved boulevard with young street trees |
| `maple_court_ii_site.jpg` | `maple_court_ii.jpg` | "framing for 120 new apartments. Cranes, lumber stacks, and a temporary fence" | a finished 120-apartment block |
| `body_balance_site.jpg` | `body_balance.jpg` | "a gym going up next to the park" | "free weights, a spin room, and a smoothie bar" seen through the glass |
| `eclat_site.jpg` | `eclat.jpg` | "an empty riverside parcel waiting for Founders Way to be paved" | ÉCLAT nightclub: "velvet rope, a riverside terrace", at night |

**City stages.** Use the same camera across the river at dusk, as a 3:1 panorama with no people. Save as `art/city/stage_<n>.jpg`. The population thresholds come from the data:

1. Founding Town (0+): the Lexington tower, cranes, low brick.
2. Growing Town (25,000+): a few new mid-rises.
3. Emerging City (75,000+): a cluster of towers.
4. Major City (250,000+): a dense skyline and bridges.
5. Metropolis (1,000,000+): a full skyline.

### 5.6 Bus, stops and route map

**Line 1 · Riverside Loop** runs 05:00–01:00, and the fare is $2.75. Its seven stops, in order: Riverside Lofts → Founders Way & Main → Maple Court → Church Street → Founders Park → Civic Row → Lexington Ave & River Rd, then back to Riverside Lofts.

**Bus** (`art/transit/bus_line_1.jpg`):

```text
[STYLE BLOCK] A modern low-floor city bus with no manufacturer badges, three-quarter front view at a kerb at golden hour. Livery: ivory and champagne body, a black window band, a slim gold stripe, the "LIVÉRA TRANSIT" wordmark in an elegant serif along the side, and a gold "1" route badge. The destination sign reads "1 RIVERSIDE LOOP". The street is empty, with no people and no other vehicles. 3:2.
```

**Side-view sprite** (`art/transit/bus_line_1_side.png`): the same bus as a flat side view on a transparent background, 2048×512.

**Brand mark** (`art/transit/livera_transit_mark.png`): use the ICON BLOCK to draw an elegant serif "LT" inside a thin gold ring, with the words "LIVÉRA TRANSIT" beneath. This is the one icon where text is allowed.

**Stop shelters.** Save as `art/transit/stops/<stop_id>.jpg`, using the BUILDING BLOCK framing:

```text
A glass-and-black-steel bus shelter with a slim totem sign reading "LIVÉRA TRANSIT · 1 · {STOP NAME}", at golden hour, empty, with {CONTEXT} behind it.
```

| stop_id | {STOP NAME} | {CONTEXT} |
|---|---|---|
| `stop_riverside` | Riverside Lofts | brick lofts and the river |
| `stop_founders_main` | Founders Way & Main | shopfronts on the new boulevard |
| `stop_maple_court` | Maple Court | the starter apartment block |
| `stop_church_street` | Church Street | Greater Hope's white steeple |
| `stop_founders_park` | Founders Park | saplings and the dry fountain |
| `stop_civic_row` | Civic Row | the police station's flagpoles |
| `stop_lexington_ave` | Lexington Ave & River Rd | the Lexington tower |

**Route map** (`art/transit/route_line_1.png`, 2048×1024):
- A clean transit diagram on warm ivory.
- One gold loop line with seven black-ringed stop dots, labelled in the order above in an elegant serif.
- A small "1 · RIVERSIDE LOOP" title, and a footer reading "Every day 05:00–01:00 · Fare $2.75".

**No fare-inspector art.** Inspectors are not characters in the game. Riding without a ticket is a 15% chance of a check and a $100 fine.

### 5.7 App icons (APP ICON BLOCK)

Save as `art/icons/apps/<app>.png`. The ids are the 26 app names the server accepts. Each glyph is art direction.

| App | Glyph | App | Glyph |
|---|---|---|---|
| `bank` | a columned bank front | `wallet` (LivPay) | a folded wallet with a small "L" spark |
| `store` | a stack of three L-coins | `messages` | a speech bubble, not shaped like any real messaging app's |
| `contacts` | a person on an index card | `romance` | two interlocking rings |
| `family` | a small house with two adults and a child | `fame` | a star with rays |
| `calendar` | a page with a date grid | `notifications` | a bell |
| `weather` | a sun partly behind a cloud | `health` | a heart with a pulse line |
| `items` | a structured bag | `pets` | a paw |
| `map` | a folded map with a pin | `transit` | a bus front with the route "1" |
| `city` | a skyline with a crane | `career` | a briefcase with an upward arrow |
| `jobs` | a magnifier over a briefcase | `work` | a clock over a name badge |
| `school` | a mortarboard | `property` | a key with a house-shaped bow |
| `homes` | a house with a small sign | `studio` | piano keys under a sound wave |
| `sports` | a ball, half soccer and half basketball | `record` | a folder with a small gavel |

### 5.8 Other icon sets (ICON BLOCK)

Save as `art/icons/<set>/<id>.png`. Make one icon per id, spelled exactly as the data spells it.

- **speech** (the three volumes in the game):
  - `say`: a single speech bubble.
  - `whisper`: a small dotted bubble with a "shh" curl.
  - `shout`: a jagged bubble with radiating lines.
- **needs** (10): `hunger`, `energy`, `hygiene`, `social`, `recreation`, `comfort`, `health`, `bladder`, `dental`, `grooming`.
- **emotions** (9): `happiness`, `stress`, `confidence`, `loneliness`, `anger`, `sadness`, `excitement`, `embarrassment`, `jealousy`. Use simple, abstract face marks.
- **conditions** (19): `common_cold`, `flu`, `food_poisoning`, `hungover`, `toothache`, `depression`, `humiliated`, `alcohol_dependence`, `glint_addiction`, `haze_dependence`, `velvet_addiction`, `crimson_bloom`, `ashen_itch`, `silent_lace`, `hollow_fever`, `seasonal_allergies`, `heartburn`, `insomnia`, `strep_throat`.
  - The four fictional STIs (`crimson_bloom`, `ashen_itch`, `silent_lace`, `hollow_fever`) get abstract shapes: a bloom, ash flakes, a lace knot, a hollow circle. No anatomy.
- **social** (6): `chat`, `compliment`, `joke`, `deep_talk`, `argue`, `flirt`.
- **family** (7 care actions): `feed`, `bathe`, `play`, `story`, `homework`, `bedtime`, `talk`.
- **fame** (5): `resident`, `local_name`, `rising_star`, `celebrity`, `icon`. Use one to five stars.
- **degrees** (8): `high_school`, `bachelors`, `masters`, `jd`, `md`, `bsn`, `doctorate`, `police_academy`. Use a rolled diploma with a different ribbon or seal for each.
- **sports** (2): `soccer`, `basketball`.
- **weather**:
  - The 5 weather ids from the data: `sun`, `cloud`, `rain`, `storm`, `snow`.
  - Four season icons, `winter`, `spring`, `summer` and `autumn` (art direction: the data defines seasons by month).
  - `day` and `night` (art direction).
- **instruments:** one per id in `data/music/instruments.json`.
- **activities:** one per activity id in the place data.
- **careers:** one per career id, from `data/careers/*.json` plus `coaching`, `restaurant` and `veterinary` in `data/world/`. Show each as its work symbol: an apron for the café, a badge for police, a stethoscope for nursing, and so on.
- **teams** (4): use crests instead of line icons. They are invented shield crests with no resemblance to any real club or league.

| team id | Crest |
|---|---|
| `livera_lions` | a gold lion head on black (soccer) |
| `riverside_rovers` | a teal wave on ivory (soccer) |
| `founders_five` | five stars over a ball, burgundy on cream (basketball) |
| `river_city_hoops` | a bridge arc over a hoop, navy and copper (basketball) |

### 5.9 Cars (only once driving exists)

The game has no driving yet. When it's added, each vehicle model will get an id and a price in the data. Make these pictures then, and name the files after those ids.

```text
[STYLE BLOCK] A {BODY STYLE, e.g. compact hatchback, pickup truck, electric sedan, scooter} in {COLOUR}: an invented design with no manufacturer badges, and no grille, lights or silhouette recognisable as a real brand or model. Three-quarter front view, parked at a kerb on an empty Livéra street at golden hour, with no people and no other vehicles. 3:2.
```

- **Map sprite:** the same vehicle as a flat side view on a transparent background, 2048×768, plus a top-down view at 1024×1024 for the town map.
- **Files:** `art/vehicles/<vehicle_id>.jpg`, `art/vehicles/<vehicle_id>_side.png`, `art/vehicles/<vehicle_id>_top.png`.

---

## 6. Technical specs

### 6.1 Sizes and formats

The current sheets are JPEG copies at quality 90:
- the nine collages are 1024×1536;
- `dax.jpg` and `dominique.jpg` are 1536×1024;
- `dominique_ages.jpg` is 1225×1284.

The original PNG masters are kept outside the repository, and `art/README.md` says to keep doing that.

| Picture | Shape | Target size (minimum) | Repo format |
|---|---|---|---|
| Model sheet (Format B) | 3:2 | 3072×2048 (1536×1024) | JPEG q90 |
| Workplace collage (Format A) | 2:3 | 2048×3072 (1024×1536) | JPEG q90 |
| Turnaround sheet (Format C) | 3:2 | 3072×2048 (1536×1024) | JPEG q90 |
| Life-stage strip or pet breed sheet, 3 panels (Format D) | about 1:1 | 2048×2048 (1225×1284) | JPEG q90 |
| Aging strip, 4 panels (Format D) | 3:2 | 3072×2048 | JPEG q90 |
| Single life-stage template or child portrait | 2:3 | 1024×1536 | JPEG q90 |
| Avatar headshot (people and pets) | 1:1 | 1024×1024 | JPEG q90 |
| Town-preview face crop (made by Claude Code from the avatar) | 1:1 | 160×160 | JPEG |
| Building exterior, interior, stop shelter | 3:2 | 1536×1024 | JPEG q90 |
| City-stage panorama | 3:1 | 3072×1024 | JPEG q90 |
| Map sprite (isometric building) | 1:1 | 1024×1024 | PNG with transparency |
| Items, offers, coin packs | 1:1 | 512×512 (1024 master) | PNG with transparency |
| App icons and all other icons | 1:1 | 512×512 (1024 master) | PNG with transparency |
| Bus side sprite | 4:1 | 2048×512 | PNG with transparency |
| Route map | 2:1 | 2048×1024 | PNG |

- **Upscaling:** use the tool's upscaler, not a plain resize. The minimum size is acceptable; it is what the current sheets use.
- **File types:** everything photographic is JPEG at quality 90. Use PNG only where a transparent background is needed.

### 6.2 Folders and file names

File names use the data ids in lower case, with the same hyphens and underscores the data uses.

```text
art/
  README.md
  reference/
    characters/<id>.jpg                 founders' main sheets (existing)
    characters/<id>_turnaround.jpg      turnaround + expressions, Format C (reference_sheets kind "turnaround")
    characters/<id>_ages.jpg            life-stage strip (kind "life_stages"; dominique_ages.jpg already exists)
    characters/<id>_aging.jpg           future looks 40/50/65/80 (kind "aging")
    characters/dominique_collage.jpg    her name-card collage (kind "collage")
    residents/<save-id>.jpg             residents made in the creator: sol-rivera.jpg, theo-grant.jpg, rosa-delgado.jpg, kai-morgan.jpg
    residents/<save-id>_collage.jpg     optional Format A collage
    residents/<save-id>_aging.jpg       optional aging strip
    residents/<child-id>.jpg            a born child's art, only after the birth is recorded
  avatars/<id>.jpg                      1024² headshots by character id (founders optional; residents and children required)
  templates/life_stages/<file>.jpg      baby_newborn, baby_infant, toddler, child_young, child_older, teen, adult_40s, adult_50s, elder, senior; style references only, never shown as a resident
  pets/<species>/<breed_slug>.jpg       e.g. pets/dog/terrier_mix.jpg, pets/cat/maine_coon_mix.jpg
  pets/named/<owner-id>_<pet name>.jpg  harper_pepper.jpg, leila_shadow.jpg, aaliyah_bramble.jpg, rosa-delgado_rocky.jpg
  items/<item_id>.png                   e.g. lyra_pro.png, gold_watch.png, pet_food.png
  items/coins/<product_id>.png          e.g. livera.coins.550.png
  offers/<location_id>__<offer_id>.png  e.g. heritage_coffee__latte.png
  places/<location_id>.jpg              exteriors; multi-unit buildings by building name (lexington.jpg…)
  places/<site_id>_done.jpg             finished state when there is no location id for it (founders_way_site_done.jpg)
  places/interiors/<location_id>.jpg
  places/iso/<location_id>.png          optional map sprites
  places/types/<type>.jpg
  city/stage_<1-5>.jpg
  transit/bus_line_1.jpg, bus_line_1_side.png, livera_transit_mark.png, route_line_1.png
  transit/stops/<stop_id>.jpg
  icons/apps/<app>.png
  icons/<set>/<id>.png                  set = speech, needs, emotions, conditions, social, family, fame, degrees, sports, teams, weather, services, pets, instruments, activities, careers
```

**These new conventions need a `docs/DECISIONS.md` entry:**
- `art/reference/residents/` and `art/pets/named/`, because created residents and pets live in the save, not in `data/`.
- Every folder outside `art/reference/`.

### 6.3 Check every image before saving

- [ ] The face is the same person in every panel, and it doesn't look like a founder, a celebrity or another resident.
- [ ] The card text and captions match the prompt letter for letter, and the age and job title are current.
- [ ] No real logos, monogram patterns, lock-and-strap hardware or recognisable real product. No watermark.
- [ ] Pronouns and card fields come from the data, with no Ethnicity row unless the data states one.
- [ ] Under-18s use the FAMILY STYLE BLOCK and look age-appropriate.
- [ ] Buildings have no people and no cars, and the fire station reads as a placeholder.
- [ ] A named pet's coat colour matches the one you wrote down.
- [ ] Icons and items have a truly transparent background.

---

## 7. Prompt for Claude Code (after you've made the images)

1. Put the new images in one folder: `livera/art/_incoming/`. Don't commit that folder.
2. Paste the prompt below into Claude Code.
3. Paste section 6 of this pack underneath it.

```text
I've generated new LIVÉRA art and put it in livera/art/_incoming/. Add it to the repo properly. Section 6 of my LIVÉRA Art Prompt Pack (sizes, folders, file names) is pasted below this prompt.

1. Read livera/CLAUDE.md, livera/art/README.md, livera/docs/DECISIONS.md and livera/docs/DATA_MODEL.md first.
2. Look at every image in _incoming yourself. For each one, tell me what it is and which file name it should get. Flag (do not add) any image with misspelled card text, a real brand logo, monogram pattern or lock-and-strap bag, a face that doesn't match the person's other art, people or cars in a building shot, or glamour styling on anyone under 18. Ask me about anything you can't identify.
3. Rename and place each file per section 6.2. Convert photographic images to JPEG quality 90 at full resolution with Pillow (strip metadata). Keep icons, items and sprites as PNG with transparency, downsized to 512×512 where section 6.1 says so. Don't commit PNG masters of photographic art (art/README.md: masters live outside the repo).
4. Founders: in livera/data/characters/<id>.json, add each new sheet to profile.appearance.reference_sheets under its kind (turnaround, aging, life_stages, collage). If a founder has no reference_sheets yet, also list their main sheet (kind "collage" for the nine portrait collages, "model_sheet" for dax.jpg), because art/README.md says reference_sheets lists them all. Keep visual_reference pointing at the main sheet. Then run python3 livera/scripts/format_data.py.
5. Residents made in the creator (sol-rivera, theo-grant, rosa-delgado, kai-morgan) and named pets live in the save, not in data/characters. Propose the smallest way to link their art (for example a data manifest validated by ContentDatabase, plus a test that every path exists), then implement it with tests. Add a DECISIONS.md entry for art/reference/residents/, art/pets/named/ and the other new art folders, and update DATA_MODEL.md if a data format changes.
6. If any card was left blank on purpose, typeset it in Cormorant Garamond with the exact text from the prompt pack, matching the existing cards (near-black panel, warm-ivory name, champagne-gold labels and headings, ◆ bullets).
7. Update livera/art/README.md: add the new sheets to the table (with their card titles), document the new folders and formats, and say which residents now have art.
8. Town preview: if this session still has its source (days20_shell.html, prep20.py and build_page.py in the scratchpad's preview folder), make 160×160 face crops (face_<id>.jpg) from art/avatars/<id>.jpg for every resident who now has art, include them in preview_faces.json, and change the "No art yet" hint so it shows only for people who still have none. Never claim art that doesn't exist. Rebuild the page and republish it to its existing link. If the source isn't available, skip this step and tell me.
9. Do NOT stop, restart or start any livera_server, run_day.py or chain.sh process, and don't touch the recording's checkpoint or output folders. From the livera folder: if a recording is running, build in a separate directory so you don't replace the binary it uses (cmake -S . -B build-art -G Ninja && cmake --build build-art && ./build-art/livera_tests); otherwise use the normal build from CLAUDE.md (cmake -S . -B build -G Ninja && cmake --build build && ./build/livera_tests). All tests must pass, including "cast: every character is complete and linked to art that exists".
10. Report exactly what was added, linked and flagged, then commit with a clear message. Ask me before pushing.
```