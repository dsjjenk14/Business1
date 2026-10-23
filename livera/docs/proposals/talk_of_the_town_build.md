# Building Talk of the Town, the owner's way (Release 5)

**Superseded by `golden_hour_build.md` (D-076):** the owner then chose Golden Hour as the frame, combined with the best
of Talk of the Town. The owner's changes listed below still hold.

After the redesign showdown (`docs/proposals/showdown/`), the owner chose Studio Ember's **Talk of the Town**
(`showdown/talk_of_the_town.md`) with these changes, in their words:

- "Bring chores back." Chores stay on screen and stay playable; the redesign's habits do not take them over.
- "Don't shrink the day so much." No four-beat day that skips between beats: the day is still lived hour by hour,
  on the open map.
- "Add social media, not a morning paper." The town's story comes back to you through a social media app on the
  phone, not a newspaper.
- The clock: **yes**, days move faster than one game minute per real second.
- "Talk of the Town build, but more open world": free roaming on the town map stays the way you play; scenes happen
  in the rooms you walk into, and people are out and about in the streets.
- Money: **yes** (Ember's model: cosmetic only, a season pass, and one crew subscription for an always-on town).
- "Phone more useful." "Sitting down needs to look better." "Add more people to the town."

The decision is D-071 in `docs/DECISIONS.md`. Every rule in `CLAUDE.md` still holds: the World decides, the client
shows only what your character may know, money moves only through the ledger, content is data, nothing pretends.

## What Release 5 builds, in workstreams

### 1. The whole character, sitting and walking (client)
The owner's sprite sheets (`art/sprites/characters/<id>/sheet.webp`, 4 × 3 cells: a 4-frame walk toward the lower
left, a 4-frame walk away toward the upper right, standing front and back, sitting on a chair and on a sofa) are cut
into frames for the client (Ember's cutter from the showdown, the repository's BiRefNet matte). `figures.js` keeps
its `drawFigure()` API and draws the walk cycle when walking, the standing frames when idle, and the **real seated
frames** on chairs, stools, sofas and beds (anchored on the seat, not a standing picture lowered into it), on the map
and in the rooms. People without a sheet yet keep today's cut-outs.

### 2. More people in the town (data, core, art prompts)
The town gets residents who live there on their own: the four created residents with art (Kai Morgan, Rosa Delgado,
Sol Rivera, Theo Grant) become data characters, and new townspeople take the jobs that leave places empty (the café's
barista, the Copper Tap's bartender, a cashier, a nurse and a doctor, a police officer on duty, a teacher, a server).
They follow schedules (work, errands, evenings out), so places are staffed in their hours and venues fill in the
evening. Founders and townspeople a script plays are always labelled. New townspeople get prompts in the character
pack (a model sheet and a sprite sheet each); until their art arrives they are drawn as a labelled stand-in.

### 3. Social media and a phone that's useful (core, client)
A social app on the phone is how word gets around: people post (characters a script plays post from what really
happened to them: a promotion, a performance, a new home, a date), you post (what you're doing, where, with whom),
you follow, like and comment; and **@livera.unfiltered**, the anonymous gossip account (Sienna's secret in the data),
posts what people witnessed (a fight, a scene at the bar), with rumours showing how many people heard them. Every post
is World state built from real events, and nobody sees what their character couldn't. The phone becomes the hub of
the day: messages that people answer, invitations ("Copper Tap at 9?") that they accept or decline by the World's
rules, a map of where your people are, and the apps you need on the home screen (the rest one tap deeper).

### 4. A faster clock (data, core, client)
A game day takes fewer real minutes: `minutes_per_real_second` rises, walking speeds up so a walk across town doesn't
eat the afternoon, and the single-player and Play together host get a speed control (1×, 2×, 3×) like The Sims.

### 5. Rooms (data)
The remaining place rooms and the first homes are traced (`data/interiors/`), so chores happen at home where they
belong (the shower, the stove, the bed) and every venue is a scene.

### Later in Release 5 (after the above)
- **Scenes and secrets:** moves in a room (warm, bold, secret, rough), who knows what, secrets that open new moves.
- **Square Up:** the fist fight as three exchanges of reading the other person's tell, with what you were told making
  tells more reliable; every D-070 rule kept.
- **Story threads** from the founders' real secrets (Miami, the Maple Court flip, the Parallax demo).
- **Money:** a cosmetic season pass, the wardrobe, and the crew's always-on town on the server (needs a payment
  provider chosen by the owner before anything is charged).
