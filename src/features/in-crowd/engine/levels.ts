import { CLIENTS, ROSTER } from './content';
import { mulberry32 } from './rng';
import type { Chapter, LevelDef, TipId } from './types';

/**
 * Five venues, four nights each. Every chapter adds a counter or a kind of
 * trouble, and the last night of each one is the host's big moment.
 *
 * Goal and Expert scores were set with the balance bot
 * (`scripts/in-crowd-balance.mjs`), playing with the upgrades a player
 * usually owns by that venue. Goal is 45–70% of a slow, casual bot (the
 * share grows venue by venue); Expert is 82% of a fast, sharp one.
 */

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    venue: 'rooftop',
    title: 'Rooftop Glow-Up',
    place: 'The Lumen Rooftop, downtown Clout City',
    client: CLIENTS.bella!,
    intro: [
      'Kiki! Thank goodness. My lip oil launches tonight and my planner just ghosted me.',
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
      'Welcome to the Villa! Eight creators live here. Forty more are coming over.',
      'We have a kitchen now, which means everyone wants avocado toast. Constantly.',
      'Also Jax is planning a prank. I do not know what it is. Nobody does.',
    ],
    outro: 'The pool party hit the front page of every feed. Coco says you are an honorary Villa member.',
  },
  {
    id: 3,
    venue: 'studio',
    title: 'Neon Pod Premiere',
    place: 'Unfiltered Signal Studios, Neon District',
    client: CLIENTS.marcus!,
    intro: [
      'Kiki. Episode one hundred. Live audience. Brands are circling.',
      'The PR desk has contracts ready. Get them signed and everybody eats.',
      'One thing: the studio Wi-Fi is held together with tape. Keep an eye on the router.',
    ],
    outro: 'Episode one hundred broke the podcast charts. Marcus called you a legend on air. Twice.',
  },
  {
    id: 4,
    venue: 'festival',
    title: 'Glowfest VIP Tent',
    place: 'Glowfest, Mirage Desert',
    client: CLIENTS.nova!,
    intro: [
      'Kiki, the VIP tent is yours. Sixty thousand people out there, the loudest ones in here.',
      'It is dusty, it is dark, and somebody will spill a smoothie every four minutes.',
      'Keep the tent alive until my encore. I trust you.',
    ],
    outro: 'Nova dedicated the encore to "the planner who kept the tent alive." The clip has 40 million views.',
  },
  {
    id: 5,
    venue: 'gala',
    title: 'Golden Phone Awards',
    place: 'The Grand Clout Ballroom',
    client: CLIENTS.sky!,
    intro: [
      'Kiki Vance. Everyone says you are the best. Tonight we find out.',
      'This is the Golden Phone Awards afterparty. Every creator who matters is on the list.',
      'Make it perfect, and I will hand you an award myself.',
    ],
    outro: 'Sky handed you a Golden Phone of your own: Planner of the Year. Clout City is yours.',
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

type Spec = Omit<LevelDef, 'id' | 'chapter' | 'index' | 'cast' | 'idle'> & { pace: number };

/**
 * How long guests chill between requests. Bigger parties need longer breaks
 * or nobody could keep up; `pace` above 1 makes a night busier.
 */
function idleFor(guests: number, pace: number): [number, number] {
  const r = (v: number) => Math.round(v * 10) / 10;
  return [r((0.85 * guests + 2) / pace), r((1.35 * guests + 4) / pace)];
}

const SPECS: Spec[][] = [
  // ── Chapter 1: Rooftop Glow-Up ──────────────────────────────────────
  [
    {
      name: 'Golden Hour',
      blurb: 'Seat the first guests and keep the mocktails coming.',
      tables: 2, guests: 7, late: 0, duration: 100, seatingTime: 60,
      stations: ['bar', 'charge'], dishes: [],
      requests: { drink: 3, charger: 2 },
      patience: 0.07, pace: 1.0, troubles: null, lives: [],
      goal: 2050, expert: 4300, tips: ['seating', 'bar', 'charge'],
    },
    {
      name: 'Lip Oil Launch',
      blurb: 'The glam station opens. Beauty creators will need it.',
      tables: 3, guests: 10, late: 0, duration: 120, seatingTime: 55,
      stations: ['bar', 'charge', 'glam'], dishes: [],
      requests: { drink: 3, charger: 2, glam: 2.5 },
      patience: 0.078, pace: 1.03, troubles: null, lives: [],
      goal: 2350, expert: 4700, tips: ['glam', 'streak'],
    },
    {
      name: 'Selfie Sunset',
      blurb: 'Everyone wants a picture with the planner.',
      tables: 3, guests: 12, late: 0, duration: 130, seatingTime: 55,
      stations: ['bar', 'charge', 'glam'], dishes: [],
      requests: { drink: 3, charger: 2, glam: 2, selfie: 2 },
      patience: 0.082, pace: 1.06, troubles: null, lives: [],
      goal: 3250, expert: 6000, tips: ['selfie', 'viral'],
    },
    {
      name: 'Bella Goes Live',
      blurb: 'Bella streams the launch. Set up the stage when she calls.',
      tables: 4, guests: 14, late: 0, duration: 150, seatingTime: 60,
      stations: ['bar', 'charge', 'glam', 'light'], dishes: [],
      requests: { drink: 3, charger: 2, glam: 2, light: 2, selfie: 1.5 },
      patience: 0.085, pace: 1.08, troubles: { kinds: ['paparazzi'], first: 40, every: [32, 45], max: 1 }, lives: [55, 115],
      goal: 4100, expert: 6950, tips: ['light', 'live', 'paparazzi'],
    },
  ],
  // ── Chapter 2: Vibe Villa Pool Party ───────────────────────────────
  [
    {
      name: 'Snack Attack',
      blurb: 'Craft Services is open. Take orders, serve food, clear plates.',
      tables: 3, guests: 11, late: 0, duration: 140, seatingTime: 55,
      stations: ['kitchen', 'bar', 'charge'], dishes: ['avotoast', 'sushi'],
      requests: { order: 3, drink: 3, charger: 2 },
      patience: 0.08, pace: 1.0, troubles: null, lives: [],
      goal: 3800, expert: 6850, tips: ['kitchen', 'plates'],
    },
    {
      name: 'Content House',
      blurb: 'Trolls follow the Villa everywhere. Block them on sight.',
      tables: 4, guests: 14, late: 0, duration: 150, seatingTime: 60,
      stations: ['kitchen', 'bar', 'charge', 'light'], dishes: ['avotoast', 'sushi', 'cupcake'],
      requests: { order: 3, drink: 2.5, charger: 2, light: 1.5, selfie: 1.5 },
      patience: 0.085, pace: 1.04, troubles: { kinds: ['troll'], first: 30, every: [26, 38], max: 1 }, lives: [],
      goal: 3350, expert: 7350, tips: ['troll'],
    },
    {
      name: 'Prank Wars',
      blurb: 'Rivals at the same table means drama. Seat them apart.',
      tables: 4, guests: 15, late: 0, duration: 160, seatingTime: 60,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light'], dishes: ['avotoast', 'sushi', 'cupcake'],
      requests: { order: 3, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, selfie: 1.5 },
      patience: 0.088, pace: 1.07, troubles: { kinds: ['troll', 'drama', 'paparazzi'], first: 25, every: [24, 34], max: 2 }, lives: [80],
      goal: 4250, expert: 8000, tips: ['drama'],
    },
    {
      name: 'Pool Float Finale',
      blurb: 'Coco goes live twice. The whole Villa is watching.',
      tables: 5, guests: 18, late: 0, duration: 170, seatingTime: 65,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 3, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, selfie: 1.5 },
      patience: 0.09, pace: 1.1, troubles: { kinds: ['troll', 'drama', 'paparazzi'], first: 25, every: [22, 32], max: 2 }, lives: [60, 125],
      goal: 4250, expert: 8000, tips: [],
    },
  ],
  // ── Chapter 3: Neon Pod Premiere ───────────────────────────────────
  [
    {
      name: 'Brand Deal Night',
      blurb: 'The PR desk opens. Contracts are worth big clout.',
      tables: 4, guests: 15, late: 0, duration: 160, seatingTime: 60,
      stations: ['kitchen', 'bar', 'charge', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake'],
      requests: { order: 2.5, drink: 2.5, charger: 2, light: 1.5, contract: 2, selfie: 1.2 },
      patience: 0.088, pace: 1.05, troubles: { kinds: ['troll', 'paparazzi'], first: 30, every: [26, 36], max: 1 }, lives: [],
      goal: 4250, expert: 8050, tips: ['pr'],
    },
    {
      name: 'Signal Lost',
      blurb: 'When the Wi-Fi drops, everybody gets cranky. Fast.',
      tables: 4, guests: 15, late: 0, duration: 160, seatingTime: 60,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
      patience: 0.09, pace: 1.08, troubles: { kinds: ['wifi', 'troll', 'drama'], first: 25, every: [22, 32], max: 2 }, lives: [90],
      goal: 4500, expert: 7900, tips: ['wifi'],
    },
    {
      name: 'Fashionably Late',
      blurb: 'VIPs keep showing up mid-show. Find them a good seat.',
      tables: 4, guests: 11, late: 5, duration: 170, seatingTime: 55,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
      patience: 0.09, pace: 1.1, troubles: { kinds: ['wifi', 'troll', 'paparazzi'], first: 30, every: [24, 34], max: 2 }, lives: [100],
      goal: 4750, expert: 8000, tips: ['late'],
    },
    {
      name: 'Episode 100',
      blurb: 'Two live segments, a full house, and that router.',
      tables: 5, guests: 17, late: 3, duration: 180, seatingTime: 65,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 1.5, light: 1.5, contract: 1.5, selfie: 1.2 },
      patience: 0.092, pace: 1.08, troubles: { kinds: ['wifi', 'troll', 'drama', 'paparazzi'], first: 22, every: [20, 30], max: 2 }, lives: [60, 130],
      goal: 4800, expert: 9300, tips: [],
    },
  ],
  // ── Chapter 4: Glowfest VIP Tent ──────────────────────────────────
  [
    {
      name: 'Sound Check',
      blurb: 'Smoothies everywhere. Mop spills before someone slips.',
      tables: 5, guests: 17, late: 0, duration: 170, seatingTime: 65,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light'], dishes: ['avotoast', 'sushi', 'acai'],
      requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, selfie: 1.5 },
      patience: 0.09, pace: 1.06, troubles: { kinds: ['spill', 'troll'], first: 25, every: [20, 30], max: 2 }, lives: [],
      goal: 4250, expert: 8000, tips: ['spill'],
    },
    {
      name: 'Headliner Hype',
      blurb: 'Nova is about to go on. The tent is packed.',
      tables: 5, guests: 18, late: 2, duration: 180, seatingTime: 65,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
      patience: 0.092, pace: 1.12, troubles: { kinds: ['spill', 'paparazzi', 'drama'], first: 22, every: [20, 30], max: 2 }, lives: [75, 140],
      goal: 6300, expert: 9850, tips: [],
    },
    {
      name: 'Dust Storm',
      blurb: 'Everything that can go wrong, will. Stay calm.',
      tables: 5, guests: 17, late: 3, duration: 180, seatingTime: 65,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 3, charger: 2.5, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
      patience: 0.095, pace: 1.14, troubles: { kinds: ['spill', 'wifi', 'troll', 'drama', 'paparazzi'], first: 18, every: [16, 24], max: 3 }, lives: [100],
      goal: 5300, expert: 9050, tips: [],
    },
    {
      name: "Nova's Encore",
      blurb: 'Six tables. Two lives. One encore.',
      tables: 6, guests: 21, late: 3, duration: 190, seatingTime: 70,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 3, charger: 2, glam: 1.5, light: 1.5, contract: 1.2, selfie: 1.5 },
      patience: 0.095, pace: 1.12, troubles: { kinds: ['spill', 'wifi', 'troll', 'drama', 'paparazzi'], first: 20, every: [18, 26], max: 2 }, lives: [70, 145],
      goal: 6100, expert: 10300, tips: [],
    },
  ],
  // ── Chapter 5: Golden Phone Awards ────────────────────────────────
  [
    {
      name: 'Red Carpet Arrivals',
      blurb: 'The biggest names arrive late, on purpose.',
      tables: 5, guests: 14, late: 6, duration: 180, seatingTime: 60,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 2, light: 1.5, contract: 1.5, selfie: 2 },
      patience: 0.095, pace: 1.12, troubles: { kinds: ['paparazzi', 'troll', 'drama'], first: 22, every: [20, 28], max: 2 }, lives: [110],
      goal: 5800, expert: 9250, tips: [],
    },
    {
      name: 'Best Dressed',
      blurb: 'Glam and ring lights, nonstop. Everyone wants to win.',
      tables: 6, guests: 22, late: 2, duration: 190, seatingTime: 70,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2, drink: 2.5, charger: 2, glam: 3, light: 2.5, contract: 1.5, selfie: 2 },
      patience: 0.095, pace: 1.03, troubles: { kinds: ['paparazzi', 'troll', 'drama', 'spill'], first: 20, every: [18, 26], max: 2 }, lives: [95],
      goal: 5250, expert: 9100, tips: [],
    },
    {
      name: 'Acceptance Speech',
      blurb: 'Sky goes live three times. Do not miss one.',
      tables: 6, guests: 22, late: 2, duration: 200, seatingTime: 70,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 2, light: 2, contract: 1.5, selfie: 2 },
      patience: 0.1, pace: 1.18, troubles: { kinds: ['paparazzi', 'troll', 'drama', 'wifi', 'spill'], first: 20, every: [18, 26], max: 2 }, lives: [50, 105, 160],
      goal: 7700, expert: 11200, tips: [],
    },
    {
      name: 'Creator of the Year',
      blurb: 'Everyone. Everything. Make it legendary.',
      tables: 6, guests: 20, late: 4, duration: 220, seatingTime: 75,
      stations: ['kitchen', 'bar', 'charge', 'glam', 'light', 'pr'], dishes: ['avotoast', 'sushi', 'cupcake', 'acai'],
      requests: { order: 2.5, drink: 2.5, charger: 2, glam: 2, light: 2, contract: 1.5, selfie: 2 },
      patience: 0.102, pace: 1.12, troubles: { kinds: ['paparazzi', 'troll', 'drama', 'wifi', 'spill'], first: 18, every: [16, 24], max: 3 }, lives: [70, 150],
      goal: 6350, expert: 11950, tips: [],
    },
  ],
];

export const LEVELS: LevelDef[] = SPECS.flatMap((specs, c) =>
  specs.map(({ pace, ...spec }, i) => {
    const chapter = c + 1;
    const index = i + 1;
    return {
      ...spec,
      id: `${chapter}-${index}`,
      chapter,
      index,
      idle: idleFor(spec.guests + spec.late * 0.5, pace),
      cast: cast(chapter, chapter * 101 + index * 7, spec.guests + spec.late),
    };
  }),
);

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
  late: {
    title: 'Fashionably late',
    body: 'VIPs arrive at the velvet rope mid-party. Tap them, then tap any empty seat. Do not keep them waiting.',
    icon: 'late',
  },
};
