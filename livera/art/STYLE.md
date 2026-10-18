# The Livéra look

The owner chose four pictures as the inspiration for how the town, its buildings and everything
around them should look (October 2026, decision D-055). This page turns them into rules that the
web client, the art prompts and any new picture follow.

| Reference | In the repo | What it sets |
|---|---|---|
| The Line 1 route poster | `transit/route_line_1.jpg` | A cream parchment town with sage trees and a blue river; the gold route loop with numbered gold stop badges; the deep emerald side panel with the gold lotus and letterspaced serif capitals; the emerald-and-gold bus. |
| The transit card | `transit/transit_card.png` | Deep emerald against ivory, champagne-gold lettering and lotus, a gold skyline and an arched bridge. |
| The gold laptop | `items/laptop.png` | The mood on its screen: a river at golden hour, an arched stone bridge, warm-lit trees and terraces, a peach sky rising to lavender. |
| The law office | `concept/interior_law_office.jpg` | Interiors: black marble, gold, warm lamps, a dusk skyline through the window. Its two people are not game characters. |

## Palette

Sampled from the pictures. Use these, or colours between them.

| Role | Colours |
|---|---|
| Deep emerald (panels, plates, awnings, the bus) | `#0b2b23` `#0d2117` `#051d17`, raised `#2e4636` |
| Champagne gold (trim, lettering, the route, highlights) | `#dabb85`, light `#e8cf9c` |
| Ivory and cream (stone, paper, light text) | `#f7ecd6` `#f5e3cb` `#f0dec2` |
| Sand stone (facades, paths) | `#ebd7b8` `#d9c9a9` `#d0b88f` |
| Sage and olive (lawns, trees) | `#939c87` `#b0ae90` `#827e5d` `#7a8161` |
| Golden-hour sky | peach `#fce5ba` `#f7d3ac`, rose `#e2bda0` `#d79d83`, lavender `#d2b6b1` |
| Warm wood and brick (only where named) | `#ad734e` `#884f2d` |
| Black marble (interiors) | `#0a0502` |

## Light

- **Golden hour is the signature.** Dawn and dusk in the client, and every new picture, use a low
  warm sun from the west, a soft champagne glow on stone, amber light in windows, and a sky that
  rises from peach at the horizon through rose to lavender.
- **Daytime stays warm** (champagne, never cold blue). **Night** is deep emerald-navy with gold
  window light and warm lamps.
- Sprites for the map carry the light but no sky; the client draws the sky and moves it with the
  game clock.

## Materials and motifs

- Ivory and sand stone with thin champagne-gold trim along roof edges and cornices.
- Deep emerald for awnings, doors, sign plates and the bus; charcoal glass with gold edges for
  towers and offices; warm brick only for buildings whose description or prompt names it.
- Lush rounded sage trees, with a few tiny warm lights in them at dusk and night.
- The river: calm blue-teal water that catches gold at golden hour, a cream stone embankment,
  and an arched stone bridge.
- The gold lotus mark on Livéra's own things: the wordmark, transit, signs.
- The gold route loop with numbered round badges for Line 1, as on the poster.

## Type

- **Wordmark and eyebrows:** a letterspaced classical serif in capitals (the card's "LIVÉRA
  TRANSIT"; Cinzel is close).
- **Headings:** an elegant serif (Cormorant Garamond is close).
- **Body and numbers:** a clean sans serif.

## What the look must not do

- **No towers that don't exist.** The skylines in these pictures are the future city of the
  concept posters. The founding town has only what the game's map returns. The client and the
  town sprites never add a skyline or buildings the data doesn't have. Atmosphere comes from the
  light, the sky, the river and the trees.
- **No unknown people.** People in a picture are game characters only when the cast sheets say
  so; others are noted in `manifest.json`.
- **The sketch stays labelled.** The street layout, building shapes, the river and the bridge are
  the client's sketch (`web/client/layout.js`), and the client says so on screen.

## Where it is applied

- `web/client/` draws the town and its screens in this palette and light.
- `scripts/town_prompts.py` writes it into every map-sprite prompt (`PROMPT_PACK_TOWN.md`,
  `prompts_town.html`).
- New character, place or concept art should match it.
