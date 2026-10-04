import { CLIENTS, ROSTER } from './content';
import { mulberry32 } from './rng';
import type { Chapter, Dish, LevelDef, RequestKind, Scene, StationKind, TipId, TroubleKind, TwistKind } from './types';

/**
 * Five venues, four nights each, and every night is harder than the one
 * before it: guests lose patience a little faster, ask a little more
 * often, trouble shows up sooner and more of it at once, and the plot
 * twists stack up. `heat` (1–20) is that ladder.
 *
 * The story runs through the `before` and `after` scenes: someone posting
 * as @thetealeaks is sabotaging the planner's parties. `{me}` is the
 * player's planner (Zara by default).
 *
 * Pace tweaks and the Goal/Expert scores were set with the balance bot
 * (`scripts/in-crowd-balance.mjs`), which also checks that each night is
 * harder than the last.
 */

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    venue: 'rooftop',
    title: 'Rooftop Glow-Up',
    place: 'The Lumen Rooftop, downtown Clout City',
    client: CLIENTS.bella!,
    intro: [
      '{me}! Thank goodness. My lip oil launches tonight and my planner just ghosted me.',
      'Twenty creators, one rooftop, golden hour. Keep them happy and keep them posting.',
      'If anyone unfollows me tonight, I will simply perish. No pressure.',
    ],
    outro: 'Bloom Lip Oil sold out in nine minutes. Every planner in Clout City wants your number now.',
  },
  {
    id: 2,
    venue: 'villa',
    title: 'Vibe Villa Pool Party',
    place: 'The Vibe Villa, Clout Hills',
    client: CLIENTS.coco!,
    intro: [
      'Welcome to the Villa, {me}! Eight creators live here. Forty more are coming over.',
      'We have a kitchen now, which means everyone wants avocado toast. Constantly.',
      'Also Jax is planning a prank. I do not know what it is. Nobody does.',
    ],
    outro: 'The pool party hit the front page of every feed. You are an honorary Villa member now.',
  },
  {
    id: 3,
    venue: 'studio',
    title: 'Neon Pod Premiere',
    place: 'Unfiltered Signal Studios, Neon District',
    client: CLIENTS.marcus!,
    intro: [
      '{me}. Episode one hundred. Live audience. Brands are circling.',
      'The PR desk has contracts ready. Get them signed and everybody eats.',
      'One thing: the studio Wi-Fi is held together with tape. Keep an eye on the router.',
    ],
    outro: 'Episode one hundred broke the podcast charts. I called you a legend on air. Twice.',
  },
  {
    id: 4,
    venue: 'festival',
    title: 'Glowfest VIP Tent',
    place: 'Glowfest, Mirage Desert',
    client: CLIENTS.nova!,
    intro: [
      '{me}, the VIP tent is yours. Sixty thousand people out there, the loudest ones in here.',
      'It is dusty, it is dark, and somebody will spill a smoothie every four minutes.',
      'Keep the tent alive until my encore. I trust you.',
    ],
    outro: 'I dedicated the encore to the planner who kept the tent alive. The clip has 40 million views.',
  },
  {
    id: 5,
    venue: 'gala',
    title: 'Golden Phone Awards',
    place: 'The Grand Clout Ballroom',
    client: CLIENTS.sky!,
    intro: [
      '{me}. Everyone says you are the best. Tonight we find out.',
      'This is the Golden Phone Awards afterparty. Every creator who matters is on the list.',
      'Make it perfect, and I will hand you an award myself.',
    ],
    outro: 'Clout City is yours.',
  },
];

const POOLS: string[][] = [
  ['mia', 'theo', 'priya', 'zoe', 'dani', 'kenji', 'malik', 'luna', 'ava', 'rio', 'pixel', 'aria', 'jun', 'fern', 'jax', 'nia', 'blair', 'tia', 'sage', 'hazel'],
  ['jax', 'nia', 'benny', 'olive', 'dev', 'rae', 'ty', 'mochi', 'rex', 'pia', 'gus', 'rocco', 'pippa', 'tony', 'momo', 'brick', 'duke', 'tia', 'rio', 'kai', 'jun'],
  ['sam', 'ada', 'leo', 'bri', 'omar', 'skye', 'dev', 'rae', 'benny', 'syntax', 'max', 'ty', 'rex', 'novavr', 'kai', 'malik', 'ivy', 'raj', 'lily', 'olive', 'gus', 'aria'],
  ['pixel', 'aria', 'syntax', 'fern', 'jun', 'max', 'tia', 'ivy', 'sage', 'duke', 'tony', 'raj', 'lily', 'rio', 'luna', 'hazel', 'kai', 'jax', 'rae', 'mochi', 'skye', 'theo', 'momo', 'pippa'],
  ROSTER.map((g) => g.id),
];

/** A seeded pick from the chapter's crowd, topped up from the whole roster. */
function cast(chapter: number, seed: number, count: number): string[] {
  const rng = mulberry32(seed);
  const shuffle = (ids: string[]) => {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j] as string, a[i] as string];
    }
    return a;
  };
  const pool = shuffle(POOLS[chapter - 1] ?? []);
  const rest = shuffle(ROSTER.map((g) => g.id).filter((id) => !pool.includes(id)));
  return [...pool, ...rest].slice(0, count);
}

type Spec = {
  name: string;
  blurb: string;
  tables: number;
  guests: number;
  late: number;
  duration: number;
  seatingTime: number;
  stations: StationKind[];
  dishes: Dish[];
  requests: Partial<Record<RequestKind, number>>;
  /** Which kinds of trouble can happen; how often comes from the night's heat. */
  trouble: TroubleKind[];
  lives: number[];
  twists: [number, TwistKind][];
  tips: TipId[];
  before?: Scene;
  after?: Scene;
};

const ALL6: StationKind[] = ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'];
const DISH4: Dish[] = ['avotoast', 'sushi', 'cupcake', 'acai'];
const REQ_FULL = { order: 2.5, drink: 2.5, charger: 2, glam: 2, light: 1.5, contract: 1.5, selfie: 2 };

const me = (text: string) => ({ who: 'me', text });
const say = (who: string, text: string) => ({ who, text });
const intro = (c: number): Scene => ({ lines: [...(CHAPTERS[c - 1]?.intro ?? []).map((t) => say(CHAPTERS[c - 1]!.client.id, t)), me('Leave it to me. Doors open in five.')] });
const outro = (c: number, ...more: { who: string; text: string }[]): Scene => ({
  lines: [say(CHAPTERS[c - 1]!.client.id, CHAPTERS[c - 1]!.outro), ...more],
  twist: more.length > 0,
});

const SPECS: Spec[] = [
  // ── Venue 1: Rooftop Glow-Up ─────────────────────────────────────────
  {
    name: 'Golden Hour',
    blurb: 'Seat the first guests and keep the mocktails coming.',
    tables: 2, guests: 7, late: 0, duration: 100, seatingTime: 60,
    stations: ['bar', 'charge'], dishes: [], requests: { drink: 3, charger: 2 },
    trouble: [], lives: [], twists: [], tips: ['seating', 'bar', 'charge'],
    before: intro(1),
  },
  {
    name: 'Lip Oil Launch',
    blurb: 'The glam station opens. Beauty creators will need it.',
    tables: 3, guests: 10, late: 0, duration: 115, seatingTime: 55,
    stations: ['bar', 'charge', 'glam'], dishes: [], requests: { drink: 3, charger: 2, glam: 2.5 },
    trouble: [], lives: [], twists: [], tips: ['glam', 'streak'],
  },
  {
    name: 'Selfie Sunset',
    blurb: 'Everyone wants a picture with the planner. And someone leaked the list.',
    tables: 3, guests: 12, late: 0, duration: 125, seatingTime: 55,
    stations: ['bar', 'charge', 'glam'], dishes: [], requests: { drink: 3, charger: 2, glam: 2, selfie: 2 },
    trouble: [], lives: [], twists: [[60, 'heatwave']], tips: ['selfie', 'viral', 'twists'],
    before: {
      twist: true,
      lines: [
        say('bella', 'Small problem. My old planner says I fired her. By email. Last night.'),
        me('Did you?'),
        say('bella', 'No! Someone sent it from my account. And now my whole guest list is online.'),
        say('leaks', 'Tonight at the Lumen Rooftop: Bella Bloom’s full guest list. You’re welcome. #TheTeaLeaks'),
      ],
    },
  },
  {
    name: 'Bella Goes Live',
    blurb: 'Bella streams the launch. Set up the stage when she calls.',
    tables: 4, guests: 14, late: 0, duration: 140, seatingTime: 55,
    stations: ['bar', 'charge', 'glam', 'light'], dishes: [], requests: { drink: 3, charger: 2, glam: 2, light: 2, selfie: 1.5 },
    trouble: ['paparazzi'], lives: [55, 110], twists: [[80, 'selfierush']], tips: ['light', 'live', 'paparazzi'],
    after: outro(1, say('leaks', 'Cute launch. Shame about what’s coming. See you at the Villa, {me}.')),
  },
  // ── Venue 2: Vibe Villa Pool Party ───────────────────────────────────
  {
    name: 'Snack Attack',
    blurb: 'Craft Services is open. Take orders, serve food, clear plates.',
    tables: 3, guests: 12, late: 0, duration: 140, seatingTime: 50,
    stations: ['kitchen', 'bar', 'charge'], dishes: ['avotoast', 'sushi'], requests: { order: 3, drink: 3, charger: 2 },
    trouble: ['troll'], lives: [], twists: [[70, 'deadphones']], tips: ['kitchen', 'plates', 'troll'],
    before: intro(2),
  },
  {
    name: 'Content House',
    blurb: 'The Tea Leaks posted the address. Forty extra people are outside.',
    tables: 4, guests: 14, late: 0, duration: 150, seatingTime: 50,
    stations: ['kitchen', 'bar', 'charge', 'light'], dishes: ['avotoast', 'sushi', 'cupcake'], requests: { order: 3, drink: 2.5, charger: 2, light: 1.5, selfie: 1.5 },
    trouble: ['troll', 'paparazzi'], lives: [], twists: [[50, 'leak'], [110, 'heatwave']], tips: [],
    before: {
      lines: [say('coco', 'The Tea Leaks posted our address. There are forty extra people outside.'), me('Then we make the ones inside feel like the only ones who matter.')],
    },
  },
  {
    name: 'Prank Wars',
    blurb: 'Rivals at one table means drama. And an uninvited guest is coming.',
    tables: 4, guests: 15, late: 0, duration: 155, seatingTime: 50,
    stations: ['kitchen', 'bar', 'charge', 'glam', 'light'], dishes: ['avotoast', 'sushi', 'cupcake'], requests: { order: 3, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, selfie: 1.5 },
    trouble: ['troll', 'drama', 'paparazzi'], lives: [85], twists: [[40, 'crasher'], [120, 'deadphones']], tips: ['drama', 'crasher'],
    before: {
      twist: true,
      lines: [
        say('jax', 'So. My prank was going to be fake paparazzi.'),
        say('coco', 'JAX.'),
        say('jax', 'But I cancelled it! Those cameras out front are not mine.'),
        say('rhea', 'Hi, {me}. Rhea Vale. I used to plan Bella’s parties. Coco invited me. Didn’t she?'),
      ],
    },
  },
  {
    name: 'Pool Float Finale',
    blurb: 'Coco goes live twice. The chef has a temper.',
    tables: 5, guests: 17, late: 0, duration: 165, seatingTime: 50,
    stations: ['kitchen', 'bar', 'charge', 'glam', 'light'], dishes: DISH4, requests: { order: 3, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, selfie: 1.5 },
    trouble: ['troll', 'drama', 'paparazzi'], lives: [60, 125], twists: [[45, 'chefquits'], [95, 'sponsor'], [140, 'leak']], tips: [],
    after: outro(2, say('rhea', 'For the record, I am not The Tea Leaks. But I think I know who is being set up.'), me('Let me guess. Me?')),
  },
  // ── Venue 3: Neon Pod Premiere ──────────────────────────────────────
  {
    name: 'Brand Deal Night',
    blurb: 'The PR desk opens. Contracts are worth big clout.',
    tables: 4, guests: 15, late: 1, duration: 160, seatingTime: 48,
    stations: ['kitchen', 'bar', 'charge', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake'], requests: { order: 2.5, drink: 2.5, charger: 2, light: 1.5, contract: 2, selfie: 1.2 },
    trouble: ['troll', 'paparazzi', 'wifi'], lives: [], twists: [[60, 'sponsor'], [120, 'heatwave']], tips: ['pr', 'wifi'],
    before: intro(3),
  },
  {
    name: 'Signal Lost',
    blurb: 'Someone cut the router cable. Then the lights went out.',
    tables: 4, guests: 14, late: 2, duration: 165, seatingTime: 48,
    stations: ALL6, dishes: ['avotoast', 'sushi', 'cupcake'], requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
    trouble: ['wifi', 'troll', 'drama'], lives: [95], twists: [[45, 'blackout'], [120, 'deadphones']], tips: ['blackout'],
    before: {
      twist: true,
      lines: [
        say('marcus', 'Bad news. The router cable was cut. Clean cut. Someone was in here before us.'),
        me('The Tea Leaks?'),
        say('marcus', 'Whoever it is wants episode one hundred to flop. On air.'),
      ],
    },
  },
  {
    name: 'Fashionably Late',
    blurb: 'VIPs keep showing up mid-show. One of them is Rhea.',
    tables: 4, guests: 11, late: 4, duration: 170, seatingTime: 45,
    stations: ALL6, dishes: DISH4, requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
    trouble: ['wifi', 'troll', 'paparazzi'], lives: [100], twists: [[50, 'crasher'], [110, 'leak'], [150, 'glamcrisis']], tips: ['late'],
    before: { lines: [say('rhea', 'Marcus wants me on the mic tonight. About the leaks.'), me('Then you will sit where I seat you.')] },
  },
  {
    name: 'Episode 100',
    blurb: 'Two live segments, a full house, and a very nervous router.',
    tables: 5, guests: 17, late: 3, duration: 180, seatingTime: 45,
    stations: ALL6, dishes: DISH4, requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
    trouble: ['wifi', 'troll', 'drama', 'paparazzi'], lives: [60, 130], twists: [[40, 'chefquits'], [95, 'blackout'], [150, 'selfierush']], tips: [],
    after: outro(3, say('marcus', 'One more thing. We traced the leak account. It posts from the Glowfest VIP tent.'), me('That is my next booking.')),
  },
  // ── Venue 4: Glowfest VIP Tent ──────────────────────────────────────
  {
    name: 'Sound Check',
    blurb: 'Smoothies everywhere. Mop spills before someone slips.',
    tables: 5, guests: 17, late: 1, duration: 175, seatingTime: 45,
    stations: ALL6, dishes: ['avotoast', 'sushi', 'acai'], requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
    trouble: ['spill', 'troll', 'paparazzi'], lives: [], twists: [[45, 'heatwave'], [100, 'leak'], [150, 'deadphones']], tips: ['spill'],
    before: intro(4),
  },
  {
    name: 'Headliner Hype',
    blurb: 'Someone keeps flipping the power. Nova goes live mid-set.',
    tables: 5, guests: 18, late: 2, duration: 185, seatingTime: 42,
    stations: ALL6, dishes: DISH4, requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
    trouble: ['spill', 'paparazzi', 'drama', 'wifi'], lives: [120], twists: [[50, 'blackout'], [100, 'sponsor'], [160, 'glamcrisis']], tips: [],
    before: { lines: [say('nova', 'Someone keeps flipping the power during sound check.'), say('rhea', 'I saw a gold VIP wristband by the breaker. Just saying.')] },
  },
  {
    name: 'Dust Storm',
    blurb: 'Everything that can go wrong, will. Stay calm.',
    tables: 5, guests: 16, late: 3, duration: 190, seatingTime: 42,
    stations: ALL6, dishes: DISH4, requests: { order: 2.5, drink: 3, charger: 2.5, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
    trouble: ['spill', 'wifi', 'troll', 'drama', 'paparazzi'], lives: [105], twists: [[40, 'crasher'], [90, 'blackout'], [140, 'heatwave'], [170, 'leak']], tips: [],
    before: {
      twist: true,
      lines: [say('rhea', 'Plot twist: I fixed your generator. You are welcome.'), me('You... helped me?'), say('rhea', 'Someone is using both of us. I want to know who.')],
    },
  },
  {
    name: "Nova's Encore",
    blurb: 'Six tables. Two lives. One encore.',
    tables: 6, guests: 21, late: 3, duration: 195, seatingTime: 42,
    stations: ALL6, dishes: DISH4, requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
    trouble: ['spill', 'wifi', 'troll', 'drama', 'paparazzi'], lives: [70, 150], twists: [[45, 'chefquits'], [100, 'selfierush'], [150, 'blackout'], [180, 'deadphones']], tips: [],
    after: outro(4, say('leaks', 'Golden Phone Awards. Two planners. One trophy. Don’t be late, {me}.')),
  },
  // ── Venue 5: Golden Phone Awards ────────────────────────────────────
  {
    name: 'Red Carpet Arrivals',
    blurb: 'The biggest names arrive late, on purpose.',
    tables: 5, guests: 14, late: 5, duration: 195, seatingTime: 40,
    stations: ALL6, dishes: DISH4, requests: REQ_FULL,
    trouble: ['paparazzi', 'troll', 'drama', 'wifi'], lives: [115], twists: [[40, 'leak'], [90, 'crasher'], [140, 'glamcrisis'], [175, 'sponsor']], tips: [],
    before: intro(5),
  },
  {
    name: 'Best Dressed',
    blurb: 'You are nominated. So is Rhea. Glam and ring lights, nonstop.',
    tables: 6, guests: 22, late: 2, duration: 200, seatingTime: 40,
    stations: ALL6, dishes: DISH4, requests: { order: 2, drink: 2.5, charger: 2, glam: 3, light: 2.5, contract: 1.5, selfie: 2 },
    trouble: ['paparazzi', 'troll', 'drama', 'spill'], lives: [100], twists: [[35, 'glamcrisis'], [85, 'blackout'], [130, 'leak'], [175, 'heatwave']], tips: [],
    before: {
      twist: true,
      lines: [say('sky', 'Surprise: you are nominated for Planner of the Year.'), me('Nominated? Against who?'), say('sky', 'Rhea Vale. The winner is whoever runs tonight better.')],
    },
  },
  {
    name: 'Acceptance Speech',
    blurb: 'Sky goes live twice. The Tea Leaks has a plan.',
    tables: 6, guests: 21, late: 2, duration: 210, seatingTime: 40,
    stations: ALL6, dishes: DISH4, requests: REQ_FULL,
    trouble: ['paparazzi', 'troll', 'drama', 'wifi', 'spill'], lives: [70, 160], twists: [[30, 'deadphones'], [80, 'crasher'], [135, 'blackout'], [185, 'selfierush']], tips: [],
    before: {
      lines: [say('leaks', 'During Sky’s speech, everyone’s DMs go public. Unless {me} keeps the room busy.'), say('sky', 'Keep them off their phones, {me}. Whatever it takes.')],
    },
  },
  {
    name: 'Creator of the Year',
    blurb: 'Everyone. Everything. The last night.',
    tables: 6, guests: 20, late: 3, duration: 225, seatingTime: 40,
    stations: ALL6, dishes: DISH4, requests: REQ_FULL,
    trouble: ['paparazzi', 'troll', 'drama', 'wifi', 'spill'], lives: [75, 160],
    twists: [[30, 'leak'], [70, 'chefquits'], [110, 'crasher'], [150, 'blackout'], [190, 'glamcrisis'], [210, 'sponsor']], tips: [],
    before: { lines: [say('rhea', 'Last night. Whatever happens... good luck, {me}.')] },
    after: {
      twist: true,
      lines: [
        say('sky', 'I have a confession. The Tea Leaks... was me.'),
        me('You?!'),
        say('sky', 'Every leak, every blackout, every crasher was a test. I needed the best planner in Clout City for my world tour.'),
        say('rhea', 'And the fake email to Bella’s old planner? That one was me. Sorry.'),
        say('sky', 'Planner of the Year, {me}. The tour is yours.'),
      ],
    },
  },
];

/**
 * Per-night pace adjustments found by the balance bot so the strain on a
 * player climbs every single night (venue upgrades included).
 */
const PACE_TWEAK: number[] = [0.98, 0.87, 0.79, 0.68, 0.72, 0.56, 0.63, 0.69, 0.62, 0.57, 0.64, 0.65, 0.79, 1.1, 1.02, 1.03, 1.08, 0.57, 1.29, 0.68];

/** [goal, expert] per night, from the balance bot. */
const SCORES: [number, number][] = [
  [2100, 4150], [2350, 4450], [3150, 6000], [4450, 8050], [3900, 7000],
  [3850, 6800], [4550, 7900], [4850, 8150], [4600, 7750], [4600, 7650],
  [4950, 8250], [5550, 8900], [4000, 7350], [5400, 9400], [5050, 9300],
  [5350, 10100], [6100, 9850], [4750, 9450], [5800, 10900], [5900, 11400],
];

/** How long guests chill between requests: bigger parties need longer breaks. */
function idleFor(guests: number, pace: number): [number, number] {
  const r = (v: number) => Math.round(v * 10) / 10;
  return [r((0.85 * guests + 2) / pace), r((1.35 * guests + 4) / pace)];
}

export const LEVELS: LevelDef[] = SPECS.map((spec, i) => {
  const heat = i + 1;
  const chapter = Math.floor(i / 4) + 1;
  const index = (i % 4) + 1;
  const pace = (1 + 0.013 * i) * (PACE_TWEAK[i] ?? 1);
  const [goal, expert] = SCORES[i] ?? [0, 0];
  const { trouble, twists, ...rest } = spec;
  return {
    ...rest,
    id: `${chapter}-${index}`,
    chapter,
    index,
    heat,
    patience: Math.round((0.068 + 0.0021 * i) * 1000) / 1000,
    idle: idleFor(spec.guests + spec.late * 0.5, pace),
    troubles: trouble.length
      ? { kinds: trouble, first: Math.max(14, 40 - heat), every: [Math.max(12, 34 - heat), Math.max(18, 46 - Math.round(1.2 * heat))], max: heat < 6 ? 1 : heat < 14 ? 2 : 3 }
      : null,
    twists: twists.map(([at, kind]) => ({ at, kind })),
    goal,
    expert,
    cast: cast(chapter, chapter * 101 + index * 7, spec.guests + spec.late),
  };
});

export const LEVELS_BY_ID: Record<string, LevelDef> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

export function nextLevel(id: string): LevelDef | null {
  const i = LEVELS.findIndex((l) => l.id === id);
  return LEVELS[i + 1] ?? null;
}

export function chapterOf(level: LevelDef): Chapter {
  return CHAPTERS[level.chapter - 1] as Chapter;
}

/** How-to cards, shown the first time each thing turns up. */
export const TIPS: Record<TipId, { title: string; body: string; icon: string }> = {
  seating: {
    title: 'Seat the guests',
    body: 'Tap a guest card, then tap an empty seat. Hearts show how happy they would be there. Creators love sitting with niches they like and hate sitting with rivals. Happier seating means a better start.',
    icon: 'seat',
  },
  bar: { title: 'Mocktail Bar', body: 'A guest showing a glass is thirsty. Tap the bar to grab a mocktail, then tap the guest to hand it over.', icon: 'drink' },
  charge: { title: 'Charging Lounge', body: 'Phone at 1%? Tap the lounge for a charger, then tap the guest. You can carry two things at once.', icon: 'charger' },
  glam: { title: 'Glam Station', body: 'Beauty and fashion creators need touch-ups. Grab a kit from the Glam Station.', icon: 'glam' },
  light: { title: 'Ring Light Rack', body: 'Bad lighting is a crisis. Bring a ring light from the rack.', icon: 'light' },
  pr: { title: 'PR Desk', body: 'Hustlers want brand deals. Grab a contract from the PR Desk. They are worth the most clout of any request.', icon: 'contract' },
  selfie: { title: 'Selfies', body: 'A phone bubble means they want a selfie with you. Just tap them. It takes a second.', icon: 'selfie' },
  kitchen: {
    title: 'Craft Services',
    body: 'A menu bubble means they are ready to order. Tap them to take it. The kitchen cooks it; when it is ready, tap the kitchen to pick it up and serve it.',
    icon: 'order',
  },
  plates: { title: 'Clear plates', body: 'After eating, guests want their plate cleared. Tap them to take it, then drop it off at the kitchen or the recycling bins.', icon: 'plate' },
  streak: { title: 'Streaks', body: 'Do the same kind of task in a row (three drinks, two chargers) for a streak. Each one in a row is worth more clout.', icon: 'flame' },
  viral: { title: 'Go viral', body: 'Every happy guest fills the vibe meter. When it is full, the party goes viral: double clout and nobody loses patience for ten seconds.', icon: 'rocket' },
  live: {
    title: 'Going live',
    body: 'When the host is about to go live, tap the stage before the countdown ends. Make it in time and every guest gets happier. Miss it and they all lose a heart.',
    icon: 'live',
  },
  paparazzi: { title: 'Paparazzi', body: 'They slip past the rope and flash cameras at a table. Tap them to escort them out before the guests lose it.', icon: 'paparazzi' },
  troll: { title: 'Trolls', body: 'A troll pops up next to a table and starts typing. Tap it to block it.', icon: 'troll' },
  drama: { title: 'Drama', body: 'Rivals and clashing niches can start beefing. Tap either guest to mediate. Smart seating prevents most of it.', icon: 'drama' },
  wifi: { title: 'Wi-Fi down', body: 'Nobody can post, so everybody gets cranky faster. Tap the router at the bottom left to reboot it.', icon: 'wifi' },
  spill: { title: 'Spills', body: 'A puddle slows you down and grosses out the nearest table. Tap it to mop.', icon: 'spill' },
  twists: {
    title: 'Plot twists',
    body: 'Anything can happen mid-night: a heat wave, every phone dying at once, a surprise A-lister. When the banner says PLOT TWIST, look around and react fast.',
    icon: 'twist',
  },
  blackout: {
    title: 'Blackout',
    body: 'The power cuts out and everyone gets cranky fast. Tap the router at the bottom left to reset it.',
    icon: 'wifi',
  },
  crasher: {
    title: 'Party crashers',
    body: 'Uninvited VIPs show up at the rope. Seat them quickly (they are worth triple), and keep them away from their rivals. If they walk out, it costs a lot.',
    icon: 'late',
  },
  late: {
    title: 'Fashionably late',
    body: 'VIPs arrive at the velvet rope mid-party. Tap them, then tap any empty seat. Do not keep them waiting.',
    icon: 'late',
  },
};
