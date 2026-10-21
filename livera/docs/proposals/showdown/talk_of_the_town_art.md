# Talk of the Town: new pictures the redesign needs

Ten prompts, in the style of `art/PROMPT_PACK_CHARACTERS.md` and `art/PROMPT_PACK_INTERIORS.md`, ready to paste.
They follow `art/STYLE.md` and the same camera as every town sprite and interior. In order of value:

| # | File | Why the redesign needs it |
|---|---|---|
| 1 | `art/sprites/characters/dominique/fight.png` | Square Up: real fighting poses instead of a standing figure leaning |
| 2 | `art/sprites/characters/andre/fight.png` | Square Up's first opponent |
| 3 | `art/sprites/characters/sienna/gestures.png` | Talking poses: the phone up (filming), leaning in to whisper |
| 4 | `art/sprites/characters/aaliyah/gestures.png` | Talking poses for the founder at the centre of the first thread |
| 5 | `art/interiors/copper_tap_night.png` | The busiest scene at night, matching the traced room exactly |
| 6 | `art/interiors/lumiere_bistro_night.png` | The quiet scene at night |
| 7 | `art/scenes/founders_way_night.png` | Fights that spill outside, the walk home, goodbyes at a door |
| 8 | `art/scenes/underpass_night.png` | The street after dark (crime, deals, fights) as a stage |
| 9 | `art/sprites/characters/dominique/sit_clean.png` | Sitting frames without the generator's sofa baked in |
| 10 | `art/key/talk_of_the_town.png` | Title screen and store key art |

## How to use (on a phone)

1. Copy the text block under a heading and paste it into the image generator.
2. Attach the reference named in the prompt (a character's sprite sheet or reference sheet, or the room picture
   for the night versions). The night rooms **must** be made from the day picture so the traced floor, seats and
   bar still line up with `data/interiors/<room>.json`.
3. Check: the same person in every cell, the town's camera, nothing cropped, a transparent background where the
   prompt asks for one, no text, no brands.
4. Save under the name given and add it to `art/manifest.json` with anything it gets wrong under `notes`.

## Style sheet (repeated in brief in every prompt)

- **View.** Isometric 2:1 (30°) from the south-west, looking down at about 30°: the town sprites' camera.
- **Light.** Golden hour from the west for day pictures; the night pictures are lit only by the place's own
  lamps, candles and windows, warm amber against deep emerald-navy.
- **Palette.** Ivory and sand, warm oak, champagne gold (#dabb85), deep emerald (#0b2b23), sage plants.
- **Characters.** One scale for everyone: a 175 cm person is 300 px tall in a 341 px cell; same face, hair,
  skin, build and outfit as the character's existing sprite sheet; full body, nothing cropped; transparent
  background; no ground shadow (the game draws its own).
- **Honest.** No text, no logos, no skyline the founding town doesn't have, nobody in a room picture.

---

### 1. Dominique Ashford: fight sheet

Save as `art/sprites/characters/dominique/fight.png` · 1536×683 (4 × 2 cells of 384 × 341)

```text
LIVÉRA character sprite sheet for a 2.5D game: fighting poses. The same camera as the Livéra town sprites: isometric 2:1 (30°) view from the south-west, looking down at about 30°, so the person is seen from slightly above. Warm golden-hour light from the west: a soft champagne glow, a warm rim light, soft shading; clean photoreal render with the realism of the reference, no outlines. Transparent background (PNG with alpha): no floor, no ground shadow, no scenery, no props, no text, no labels, no frame or grid lines. One person, the same in every pose: the same face, hair, skin tone, body, outfit and accessories, at the same scale in every cell, full body from the top of the head to the soles, nothing cropped, feet of every figure in a row on one baseline near the bottom of its cell. No logos or brands. No weapons, no blood.

The person: Dominique Ashford, 29 (she/her), 175 cm tall, drawn 300 px tall when standing. Match the attached sprite sheet art/sprites/characters/dominique/sheet.webp exactly: soft oval face, long voluminous jet-black body waves with a centre part, warm medium-brown skin, curvy hourglass build, black double-breasted blazer with gold buttons, blush-pink wrap blouse, black high-waisted wide-leg trousers, black belt with a gold buckle, black patent pointed pumps, her gold coin pendant, small gold hoops. She has put her burgundy bag down: no bag in any cell. All poses three-quarter front, facing the lower left of the image (the game mirrors them for the other side).

Layout: 4 columns × 2 rows of equal cells on a 1536×683 canvas, one figure centred in each cell. Row 1: (1) fighting stance, fists up at chin height, weight on the back foot, chin tucked, determined; (2) wind-up of a right hook, shoulder turned back; (3) the hook landing, arm extended across the body toward the lower left, weight forward; (4) ducking low, knees bent, head down and to the side, forearms up. Row 2: (5) a two-handed shove, arms straight out toward the lower left, leaning in; (6) hit reaction, head snapped back and away, one hand coming up to the face, staggering a half step back; (7) knocked down, sitting on the floor leaning back on one hand, the other hand at her jaw, legs bent; (8) after the fight, standing, breathing hard, one hand on her ribs, hair messed up. Size 1536×683, transparent background. Save as art/sprites/characters/dominique/fight.png
```

### 2. Andre Campbell: fight sheet

Save as `art/sprites/characters/andre/fight.png` · 1536×683 (4 × 2 cells of 384 × 341)

```text
LIVÉRA character sprite sheet for a 2.5D game: fighting poses. The same camera as the Livéra town sprites: isometric 2:1 (30°) view from the south-west, looking down at about 30°, so the person is seen from slightly above. Warm golden-hour light from the west: a soft champagne glow, a warm rim light, soft shading; clean photoreal render with the realism of the reference, no outlines. Transparent background (PNG with alpha): no floor, no ground shadow, no scenery, no props, no text, no labels, no frame or grid lines. One person, the same in every pose: the same face, hair, skin tone, body, outfit and accessories, at the same scale in every cell, full body from the top of the head to the soles, nothing cropped, feet of every figure in a row on one baseline near the bottom of its cell. No logos or brands on the clothes or the trainers (draw plain trainers). No weapons, no blood.

The person: Andre Campbell, 29 (he/him), 184 cm tall, drawn 315 px tall when standing. Match the attached sprite sheet art/sprites/characters/andre/sheet.webp exactly: warm mahogany skin, lean athletic build, short locs with a taper fade, thin mustache and chin beard, small gold hoop earrings, olive suede bomber jacket, black tank, black cargo pants, plain olive-and-white trainers, gold chain, gold watch and bracelet. All poses three-quarter front, facing the lower left of the image (the game mirrors them for the other side).

Layout: 4 columns × 2 rows of equal cells on a 1536×683 canvas, one figure centred in each cell. Row 1: (1) loose, cocky fighting stance, fists low, chin up; (2) the tell: his right shoulder visibly dropping as he loads a big swing; (3) a wide right swing landing toward the lower left, weight forward, off balance; (4) ducking, bouncing low on his toes, head down, fists up. Row 2: (5) a chest-first shove, both hands out toward the lower left; (6) hit reaction, head snapped back, staggering a step; (7) knocked down, sitting on the floor leaning back on both hands, dazed; (8) after the fight, standing, jaw set, wiping his lip with the back of his hand. Size 1536×683, transparent background. Save as art/sprites/characters/andre/fight.png
```

### 3. Sienna Brooks: gesture sheet

Save as `art/sprites/characters/sienna/gestures.png` · 1536×683 (4 × 2 cells)

```text
LIVÉRA character sprite sheet for a 2.5D game: talking and reacting poses. The same camera as the Livéra town sprites: isometric 2:1 (30°) view from the south-west, looking down at about 30°. Warm golden-hour light from the west, soft champagne glow and rim light, clean photoreal render, no outlines. Transparent background (PNG with alpha): no floor, no ground shadow, no scenery, no text, no labels, no grid lines. One person, the same in every pose and at the same scale, full body, nothing cropped, feet on one baseline per row. No logos or brands; the phone is a plain dark slab with no visible screen content.

The person: Sienna Brooks, 27 (she/her), drawn at her height on the attached sheet art/sprites/characters/sienna/sheet.webp, matching it exactly: light caramel skin, slender athletic build, almond-shaped dark eyes, long glossy dark hair with curtain bangs, stacked ear piercings, burgundy leather moto jacket, black tank, charcoal high-waisted trousers, black belt, black ankle boots. All poses three-quarter front, facing the lower left.

Layout: 4 columns × 2 rows on a 1536×683 canvas. Row 1: (1) holding her phone up at eye level in both hands, filming, focused; (2) typing on her phone at waist height, a small private smile; (3) leaning in to whisper, one hand cupped by her mouth, eyes sideways; (4) arms crossed, one eyebrow up, unimpressed. Row 2: (5) laughing, head tipped back, hand at her collarbone; (6) pointing across the room with her phone hand, mouth open mid-sentence; (7) raising a glass of wine in a toast; (8) turning away over her shoulder, looking back with a knowing look. Size 1536×683, transparent background. Save as art/sprites/characters/sienna/gestures.png
```

### 4. Aaliyah Baptiste: gesture sheet

Save as `art/sprites/characters/aaliyah/gestures.png` · 1536×683 (4 × 2 cells)

```text
LIVÉRA character sprite sheet for a 2.5D game: talking and reacting poses. The same camera as the Livéra town sprites: isometric 2:1 (30°) view from the south-west, looking down at about 30°. Warm golden-hour light from the west, soft champagne glow and rim light, clean photoreal render, no outlines. Transparent background (PNG with alpha): no floor, no ground shadow, no scenery, no text, no labels, no grid lines. One person, the same in every pose and at the same scale, full body, nothing cropped, feet on one baseline per row. No logos or brands.

The person: Aaliyah Baptiste, 28 (she/her), 168 cm tall, drawn 288 px tall when standing, matching the attached sheet art/sprites/characters/aaliyah/sheet.webp exactly: soft oval face, long voluminous defined curls, deep golden-brown skin, emerald satin blouse, black high-waisted wide-leg trousers, black belt, gold cuffs and hoops, black pointed heels, a glass of white wine. All poses three-quarter front, facing the lower left.

Layout: 4 columns × 2 rows on a 1536×683 canvas. Row 1: (1) waving someone over across a room, big smile; (2) confiding, leaning forward, voice low, glass held close; (3) eyes down, hurt, arms wrapped around herself; (4) angry, throwing the contents of her glass forward toward the lower left (a splash of drink in the air, no glass flying). Row 2: (5) hands up between two people, stopping a fight; (6) laughing with her head back; (7) hugging the air goodbye at a doorway, warm; (8) sitting on a high bar stool (draw the stool: brass frame, emerald leather seat), one heel on the footrest, glass in hand. Size 1536×683, transparent background. Save as art/sprites/characters/aaliyah/gestures.png
```

### 5. The Copper Tap at night

Save as `art/interiors/copper_tap_night.png` · 1536×1024

```text
LIVÉRA interior, night version of an existing picture. Attach art/interiors/copper_tap.webp and redraw exactly the same room from exactly the same camera: isometric 2:1 (30°) cutaway from the south-west, the floor and the two far walls shown, near walls and ceiling removed. Every piece of furniture, every stool, booth, table, the bar, the stage, the darts board and the doors must stay in exactly the same place and size, pixel for pixel, because the game has traced the floor and the seats from the day picture. Change only the light: it is 23:00. Through the windows a deep emerald-navy night sky and dark trees with a few warm street lamps, never a skyline. Inside, the room is lit only by its own lamps: the brass table lamps glowing amber, the backlit bottle shelves behind the bar glowing gold, warm pools of light on the bar top and the tables, the stage under a soft spotlight, deep shadows between the pools. Champagne-gold highlights, deep emerald upholstery, warm oak. Empty: no people, no text. Transparent background outside the room. Size 1536×1024. Save as art/interiors/copper_tap_night.png
```

### 6. Lumière Bistro at night

Save as `art/interiors/lumiere_bistro_night.png` · 1536×1024

```text
LIVÉRA interior, night version of an existing picture. Attach art/interiors/lumiere_bistro.webp and redraw exactly the same room from exactly the same camera: isometric 2:1 (30°) cutaway from the south-west, the floor and the two far walls shown, near walls and ceiling removed. Every table, chair, banquette, the bar and its stools, the host stand, the wine shelves and the doors stay in exactly the same place and size, pixel for pixel, because the game has traced the floor and the seats from the day picture. Change only the light: it is 22:00. Through the tall arched windows a deep emerald-navy night sky and dark trees with warm garden lights, never a skyline. Inside, candles lit on every table, the brass sconces and the wine shelves glowing warm gold, soft pools of light on the white tablecloths, the rest of the room in rich low shadow. Ivory and champagne gold, deep emerald velvet, sage plants. Empty: no people, no text. Transparent background outside the room. Size 1536×1024. Save as art/interiors/lumiere_bistro_night.png
```

### 7. Founders Way at night, outside the Copper Tap

Save as `art/scenes/founders_way_night.png` · 1536×1024

```text
LIVÉRA outdoor scene for a 2.5D game, drawn like an interior so characters can walk and stand in it. Isometric 2:1 (30°) view from the south-west, the same camera as the town sprites, looking down at about 30°. A stretch of Founders Way, a new street in a small founding town: in the back, the front of a warm brick bar with tall lit windows and a green door under a brass lamp (the Copper Tap: no sign text), a wide pale-stone pavement in front of it running across the picture with two benches, a planter with a small tree, a street lamp, a bus shelter in emerald and gold at one side, and a strip of the asphalt road along the front edge with a kerb. It is 22:30: a deep emerald-navy sky, warm amber light spilling from the windows and the street lamp onto the pavement, soft pools of light and deep shadow. The pavement is flat, even and clear in the middle so people can stand and walk on it; nothing tall along the front edge. Palette: warm brick, ivory stone, champagne gold, deep emerald, sage. No people, no cars, no text, no skyline, no logos. Transparent background outside the scene. Size 1536×1024. Save as art/scenes/founders_way_night.png
```

### 8. The Underpass after dark

Save as `art/scenes/underpass_night.png` · 1536×1024

```text
LIVÉRA outdoor scene for a 2.5D game, drawn like an interior so characters can walk and stand in it. Isometric 2:1 (30°) view from the south-west, the same camera as the town sprites. The Underpass in the Forge yard: a short concrete road underpass beneath a new elevated road in a founding town still under construction, cutaway so the inside is in view. Cracked pale concrete floor, flat and even, clear in the middle; a half-finished colourful mural on the far wall (abstract shapes only, no words or tags); stacked construction pallets and a temporary fence with mesh at one side; a single caged work light and one warm street lamp at the mouth; puddles reflecting amber light. It is 23:00: deep emerald-navy shadows, amber pools of light, a little haze. It should feel edgy but still part of the same warm, beautiful town. No people, no vehicles, no text, no graffiti words, no logos, no skyline. Transparent background outside the scene. Size 1536×1024. Save as art/scenes/underpass_night.png
```

### 9. Dominique Ashford: sitting frames on their own

Save as `art/sprites/characters/dominique/sit_clean.png` · 1536×341 (4 cells of 384 × 341)

```text
LIVÉRA character sprite strip for a 2.5D game: sitting poses with NO furniture drawn, for a game that puts the person on its own chairs and stools. The same camera as the Livéra town sprites: isometric 2:1 (30°) view from the south-west, looking down at about 30°. Warm golden-hour light from the west, clean photoreal render, no outlines. Transparent background (PNG with alpha): no chair, no sofa, no stool, no floor, no shadow, nothing but the person, posed exactly as if seated on an invisible seat 45 cm high (cells 1–3) or a bar stool 75 cm high (cell 4). The same person as the attached art/sprites/characters/dominique/sheet.webp: same face, long jet-black waves, warm medium-brown skin, black double-breasted blazer with gold buttons, blush-pink wrap blouse, black wide-leg trousers, black patent pumps, gold coin pendant, at the same scale (300 px standing). Layout: 4 cells in one row on a 1536×341 canvas, the hips of cells 1–3 at the same height. (1) sitting upright, three-quarter front facing the lower left, hands in her lap; (2) sitting back, legs crossed, one arm along an invisible backrest, facing the lower left; (3) sitting three-quarter back, facing the upper right, leaning forward on her elbows as if at a table; (4) perched on an invisible high bar stool, one heel on an invisible footrest, facing the lower left, a cocktail glass in her hand. Size 1536×341, transparent background. Save as art/sprites/characters/dominique/sit_clean.png
```

### 10. Key art: Talk of the Town

Save as `art/key/talk_of_the_town.png` · 1536×1024

```text
LIVÉRA key art for a game's title screen. Inside the Copper Tap, a warm brick-and-brass bar in a small new riverside town, seen from the town's isometric 2:1 (30°) camera from the south-west but closer, as if the camera has pushed in. Night, lit by the bar's own amber lamps and the glowing bottle shelves. Five people from the attached reference sheets, each exactly as their sheet shows them (face, hair, skin, outfit): in the centre Dominique Ashford (art/reference/characters/dominique.jpg) standing with her arms folded, looking straight at the viewer; at the bar behind her Aaliyah Baptiste (aaliyah.jpg) with a glass, glancing sideways at Andre Campbell (andre.jpg), who leans on a high table, half a smile; at the left Sienna Brooks (sienna.jpg) holding her phone up, filming; at the right Dax Hendrix (dax.jpg) holding three darts. Tension and warmth: a story about to happen. Palette: deep emerald, champagne gold, warm brick and oak, ivory light. Leave the bottom third calmer and darker for the game's title to sit on. No text, no logos, no brand names, no skyline. Size 1536×1024. Save as art/key/talk_of_the_town.png
```
