import type { Dish, Look, Niche, Profile, RequestKind, SimpleItem, StationKind, TroubleKind, TwistKind } from './types';

/**
 * The In Crowd content: niches and their chemistry, the menu, the counters and
 * the full guest list. Every creator here is made up.
 */

export const NICHES: Record<Niche, { label: string; color: string; likes: Niche[]; dislikes: Niche[]; why: string }> = {
  beauty: { label: 'Beauty', color: '#FF6FAE', likes: ['fashion', 'music'], dislikes: ['comedy'], why: 'A prank once ruined her contour.' },
  fashion: { label: 'Fashion', color: '#B983FF', likes: ['beauty', 'music'], dislikes: ['gaming'], why: 'Hoodies at a gala? Never.' },
  music: { label: 'Music', color: '#4CC9F0', likes: ['fashion', 'comedy'], dislikes: ['tech'], why: 'Still mad about AI beats.' },
  comedy: { label: 'Comedy', color: '#FFB703', likes: ['gaming', 'foodie'], dislikes: ['fitness'], why: 'Gym talk kills the bit.' },
  gaming: { label: 'Gaming', color: '#7CF29C', likes: ['tech', 'comedy'], dislikes: ['fitness'], why: 'Tired of hearing "touch grass".' },
  tech: { label: 'Tech', color: '#5E9BFF', likes: ['gaming', 'fitness'], dislikes: ['fashion'], why: 'Thinks a hoodie is formalwear.' },
  fitness: { label: 'Fitness', color: '#FF7A45', likes: ['tech', 'beauty'], dislikes: ['foodie'], why: 'It is not cheat day.' },
  foodie: { label: 'Foodie', color: '#F4D35E', likes: ['comedy', 'music'], dislikes: ['fitness'], why: 'Hates having their plate judged.' },
};

export const NICHE_ORDER: Niche[] = ['beauty', 'fashion', 'music', 'comedy', 'gaming', 'tech', 'fitness', 'foodie'];

export const DISHES: Record<Dish, { label: string; cook: number }> = {
  avotoast: { label: 'Avocado toast', cook: 6 },
  sushi: { label: 'Sushi', cook: 7 },
  cupcake: { label: 'Cupcake', cook: 5 },
  acai: { label: 'Açaí bowl', cook: 6 },
};

export const STATIONS: Record<StationKind, { label: string; short: string; item: SimpleItem | null; blurb: string }> = {
  kitchen: { label: 'Craft Services', short: 'Kitchen', item: null, blurb: 'Takes orders, cooks, plates up.' },
  bar: { label: 'Mocktail Bar', short: 'Bar', item: 'drink', blurb: 'Neon mocktails, extra ice.' },
  charge: { label: 'Charging Lounge', short: 'Chargers', item: 'charger', blurb: 'For when a phone hits 1%.' },
  glam: { label: 'Glam Station', short: 'Glam', item: 'glam', blurb: 'Touch-up kits, blotting papers.' },
  light: { label: 'Ring Light Rack', short: 'Ring lights', item: 'light', blurb: 'Every angle is the good angle.' },
  pr: { label: 'PR Desk', short: 'Brand deals', item: 'contract', blurb: 'Contracts, ready to sign.' },
};

export const REQUESTS: Record<RequestKind, { label: string; points: number; ask: string }> = {
  drink: { label: 'Mocktail', points: 40, ask: 'Thirsty' },
  charger: { label: 'Charger', points: 40, ask: 'Phone at 1%' },
  glam: { label: 'Touch-up kit', points: 50, ask: 'Needs a touch-up' },
  light: { label: 'Ring light', points: 50, ask: 'Bad lighting' },
  contract: { label: 'Brand deal', points: 80, ask: 'Wants a brand deal' },
  selfie: { label: 'Selfie', points: 60, ask: 'Selfie time' },
  order: { label: 'Order', points: 25, ask: 'Ready to order' },
  food: { label: 'Food', points: 80, ask: 'Waiting on food' },
  plate: { label: 'Plate', points: 30, ask: 'Clear my plate' },
};

export const TROUBLES: Record<TroubleKind, { label: string; points: number; fix: string; time: number; news: string }> = {
  paparazzi: { label: 'Paparazzi', points: 70, fix: 'Escort out', time: 0.8, news: 'A paparazzo slipped past the rope' },
  troll: { label: 'Troll', points: 50, fix: 'Block', time: 0.6, news: 'A troll is in the comments. In person.' },
  drama: { label: 'Drama', points: 80, fix: 'Mediate', time: 1.5, news: 'Two guests are beefing' },
  wifi: { label: 'Wi-Fi down', points: 60, fix: 'Reboot', time: 1.2, news: 'The Wi-Fi is down. Nobody can post.' },
  spill: { label: 'Spill', points: 40, fix: 'Mop', time: 1.0, news: 'Someone spilled a smoothie' },
  blackout: { label: 'Blackout', points: 90, fix: 'Reset power', time: 1.4, news: 'The power just went out' },
};

/** Mid-night plot twists. `short` is the banner during play; `text` is the full story (Guide). */
export const TWISTS: Record<TwistKind, { title: string; text: string; short: string }> = {
  heatwave: { title: 'Heat wave', text: 'It just hit 95 degrees. Everyone wants a mocktail. Now.', short: 'Everyone wants a mocktail.' },
  deadphones: { title: 'Dead phones', text: '@thetealeaks started a livestream that drained every battery in the room.', short: 'Every phone needs a charge.' },
  selfierush: { title: 'Surprise A-lister', text: 'An A-lister just walked in and posted a selfie with the planner. Now everyone wants one.', short: 'Everyone wants a selfie.' },
  glamcrisis: { title: 'Fog machine meltdown', text: 'The fog machine broke. Every face in the room needs a touch-up.', short: 'Every face needs a touch-up.' },
  crasher: { title: 'Party crasher', text: 'Someone walked in uninvited. Seat them fast, and far from their rivals.', short: 'Seat the new guest, fast.' },
  leak: { title: 'Guest list leaked', text: '@thetealeaks posted the guest list. Paparazzi incoming.', short: 'Paparazzi incoming.' },
  blackout: { title: 'Blackout', text: 'The power just died. Reset it at the router before everyone melts down.', short: 'Tap the router to reset the power.' },
  chefquits: { title: 'The chef walked out', text: 'Craft Services is closed for 15 seconds. Orders will wait.', short: 'Kitchen closed for 15 seconds.' },
  sponsor: { title: 'Surprise sponsor', text: 'A brand just bought the night: 1.5× clout for 15 seconds!', short: '1.5× clout for 15 seconds!' },
};

/** What each niche tends to ask for (multipliers on the level's request weights). */
export const NICHE_WANTS: Record<Niche, Partial<Record<RequestKind, number>>> = {
  beauty: { glam: 2.2, light: 1.6, selfie: 1.2 },
  fashion: { selfie: 2, glam: 1.4, light: 1.2 },
  music: { drink: 1.5, light: 1.3, contract: 1.2 },
  comedy: { selfie: 1.6, drink: 1.2, order: 1.2 },
  gaming: { charger: 2.4, order: 1.2 },
  tech: { charger: 1.8, contract: 1.4 },
  fitness: { drink: 1.6, selfie: 1.4, order: 0.7 },
  foodie: { order: 2.4, drink: 1.1 },
};

export const TRAITS = {
  chill: { label: 'Chill', patience: 0.75, blurb: 'Loses patience slowly.' },
  diva: { label: 'Diva', patience: 1.35, blurb: 'Impatient, but worth 50% more.' },
  hungry: { label: 'Hungry', patience: 1, blurb: 'Orders food a lot.' },
  selfie: { label: 'Selfie lover', patience: 1, blurb: 'Always wants a selfie.' },
  hustler: { label: 'Hustler', patience: 1.1, blurb: 'Here for brand deals.' },
  none: { label: 'Easygoing', patience: 1, blurb: 'Here for a good time.' },
} as const;

// ─── Looks ────────────────────────────────────────────────────────────────

const SKIN = ['#FFE0C7', '#F3C9A2', '#E2AE7E', '#C98E5C', '#A86E45', '#8A5534', '#6B3F25', '#4B2B1B'] as const;
const HAIR = {
  black: '#1D1A1C',
  espresso: '#3A2318',
  brown: '#6B4426',
  auburn: '#8E3B1E',
  copper: '#C2672D',
  blonde: '#E9C46A',
  platinum: '#F2EAD8',
  pink: '#FF7EB6',
  blue: '#4CC9F0',
  purple: '#9B5DE5',
  mint: '#5EEAD4',
  silver: '#BFC3CC',
  red: '#E5383B',
} as const;

function look(
  skin: number,
  hair: Look['hair'],
  hairColor: keyof typeof HAIR,
  top: string,
  topAccent: string,
  pattern: Look['pattern'],
  acc: Look['acc'] = 'none',
  accColor = '#111111',
  extra: Partial<Look> = {},
): Look {
  return { skin: SKIN[skin] ?? SKIN[2], hair, hairColor: HAIR[hairColor], top, topAccent, pattern, acc, accColor, ...extra };
}

function p(
  id: string,
  name: string,
  handle: string,
  niche: Niche,
  followers: number,
  trait: Profile['trait'],
  bio: string,
  lk: Look,
  rel: Partial<Pick<Profile, 'bff' | 'rival' | 'likes' | 'dislikes'>> = {},
): Profile {
  return { id, name, handle, niche, followers, trait, bio, look: lk, ...rel };
}

// ─── The roster: 48 creators, 6 per niche ─────────────────────────────────

export const ROSTER: Profile[] = [
  // Beauty
  p('mia', 'Mia Glow', '@glowbymia', 'beauty', 2_400_000, 'diva', 'Dewy-skin evangelist. Highlighter on the cheekbones, the nose, the soul.',
    look(2, 'long', 'espresso', '#FF8FAB', '#FFE5EC', 'sequins', 'hoops', '#F5C542', { lips: '#D6336C' }), { bff: 'priya' }),
  p('theo', 'Theo Blend', '@theoblends', 'beauty', 860_000, 'none', 'Contour so sharp it has a lawyer.',
    look(0, 'curtain', 'platinum', '#C3B1E1', '#FFFFFF', 'solid', 'none', '#111', { freckles: true })),
  p('priya', 'Priya Lash', '@lashlab.priya', 'beauty', 1_300_000, 'selfie', 'Lash scientist. Will review your lashes whether you asked or not.',
    look(4, 'bun', 'black', '#F06595', '#FFD6E8', 'dots', 'hoops', '#F5C542', { lips: '#C2255C' }), { bff: 'mia' }),
  p('zoe', 'Zoe Serum', '@zoeserum', 'beauty', 540_000, 'chill', 'Twelve-step routine. Thirteen on Sundays.',
    look(1, 'bob', 'copper', '#FFF0F6', '#FF8FAB', 'stripes', 'glasses', '#B5838D', { freckles: true }), { rival: 'dani' }),
  p('kenji', 'Kenji Nails', '@nailedbykenji', 'beauty', 410_000, 'none', 'Chrome nails, chrome heart.',
    look(2, 'spiky', 'silver', '#212529', '#CED4DA', 'zip', 'shades', '#212529')),
  p('dani', 'Dani Arch', '@archangel.dani', 'beauty', 3_100_000, 'diva', 'Brows on fleek since 2014 and refusing to stop saying it.',
    look(5, 'waves', 'black', '#E64980', '#FFC9DE', 'sequins', 'hoops', '#F5C542', { lips: '#A61E4D' }), { rival: 'zoe' }),

  // Fashion
  p('malik', 'Malik Drip', '@maliksdrip', 'fashion', 1_900_000, 'diva', 'If it is not limited edition, I do not know her.',
    look(6, 'fade', 'black', '#F8F9FA', '#212529', 'check', 'shades', '#111111', { beard: true }), { bff: 'kai' }),
  p('luna', 'Luna Thrift', '@thriftqueenluna', 'fashion', 720_000, 'chill', 'Paid four dollars for this. Ask me how.',
    look(1, 'braids', 'auburn', '#9C6644', '#FFE8D6', 'check', 'beanie', '#E76F51'), { rival: 'ava' }),
  p('ava', 'Ava Couture', '@avacouture', 'fashion', 5_600_000, 'diva', 'Front row or I am not coming.',
    look(0, 'bun', 'platinum', '#111111', '#E9C46A', 'sequins', 'shades', '#111111', { lips: '#9D0208' }), { rival: 'luna' }),
  p('rio', 'Rio Fitcheck', '@fitcheck.rio', 'fashion', 980_000, 'selfie', 'Daily fit checks. Yes, even at the gym.',
    look(3, 'curtain', 'brown', '#2EC4B6', '#CBF3F0', 'stripes', 'cap', '#FF9F1C')),
  p('hazel', 'Hazel Vintage', '@hazel.vtg', 'fashion', 330_000, 'none', 'Born in the wrong decade (the seventies).',
    look(2, 'afro', 'brown', '#D4A373', '#FEFAE0', 'dots', 'glasses', '#BC6C25')),
  p('kai', 'Kai Hype', '@kaihype', 'fashion', 2_200_000, 'hustler', 'Waited nine hours for these sneakers. Worth it.',
    look(4, 'spiky', 'black', '#FB5607', '#FFBE0B', 'zip', 'bandana', '#3A86FF'), { bff: 'malik' }),

  // Music
  p('pixel', 'DJ Pixel', '@djpixel', 'music', 1_100_000, 'none', 'Drops beats, never drops calls.',
    look(5, 'buzz', 'blue', '#3A0CA3', '#4CC9F0', 'zip', 'headphones', '#F72585'), { bff: 'jun' }),
  p('aria', 'Aria Notes', '@arianotes', 'music', 4_400_000, 'diva', 'High notes, low tolerance for flat soda.',
    look(3, 'long', 'purple', '#7209B7', '#F72585', 'sequins', 'hoops', '#F5C542', { lips: '#B5179E' }), { rival: 'jax' }),
  p('syntax', 'Lil Syntax', '@lilsyntax', 'music', 780_000, 'hustler', 'Rapper. Also does your taxes.',
    look(7, 'braids', 'black', '#FFD60A', '#000814', 'solid', 'cap', '#000814', { beard: true })),
  p('fern', 'Fern Echo', '@fern.echo', 'music', 260_000, 'chill', 'Sad songs, happy girl.',
    look(0, 'waves', 'mint', '#ADB5BD', '#F8F9FA', 'stripes', 'beanie', '#495057', { freckles: true })),
  p('jun', 'Jun Star', '@junstar.dance', 'music', 6_300_000, 'selfie', 'Dance covers. Forty-seven takes per video.',
    look(1, 'curtain', 'pink', '#FFFFFF', '#FF006E', 'zip', 'hoops', '#C0C0C0'), { bff: 'pixel' }),
  p('max', 'Max Tempo', '@maxtempo', 'music', 450_000, 'none', 'Drums on everything. Including your table.',
    look(2, 'bald', 'black', '#E63946', '#1D3557', 'check', 'headphones', '#1D3557', { beard: true })),

  // Comedy
  p('jax', 'Jax Prank', '@jaxpranks', 'comedy', 3_800_000, 'diva', 'It is just a prank (my lawyer says stop).',
    look(1, 'spiky', 'blonde', '#06D6A0', '#073B4C', 'stripes', 'cap', '#EF476F'), { rival: 'aria' }),
  p('nia', 'Nia Skits', '@niaskits', 'comedy', 1_600_000, 'none', 'Plays every character in my family group chat.',
    look(6, 'afro', 'black', '#FFB703', '#FB8500', 'dots', 'hoops', '#F5C542'), { bff: 'rae' }),
  p('benny', 'Big Benny', '@bigbennyroasts', 'comedy', 920_000, 'hungry', 'Will roast you. Lovingly. Mostly.',
    look(3, 'buzz', 'espresso', '#8338EC', '#FFBE0B', 'check', 'none', '#111', { beard: true })),
  p('olive', 'Olive Puns', '@olivepuns', 'comedy', 210_000, 'chill', 'Pun intended. Always.',
    look(0, 'bob', 'red', '#80B918', '#D4F1BE', 'dots', 'glasses', '#2B9348', { freckles: true })),
  p('dev', 'Dev Laughs', '@devlaughs', 'comedy', 640_000, 'none', 'Stand-up comic. Sits down at parties.',
    look(4, 'waves', 'black', '#3A86FF', '#FFFFFF', 'solid', 'none', '#111', { beard: true })),
  p('rae', 'Rae Memes', '@raememes', 'comedy', 2_700_000, 'selfie', 'Runs fourteen meme pages. Sleeps four hours.',
    look(2, 'ponytail', 'pink', '#FF70A6', '#FFD670', 'stripes', 'shades', '#FF70A6'), { bff: 'nia' }),

  // Gaming
  p('ty', 'Ty Speedrun', '@tyspeedruns', 'gaming', 1_400_000, 'none', 'Beat the game in eleven minutes. Cannot beat traffic.',
    look(1, 'fade', 'brown', '#2B2D42', '#8D99AE', 'zip', 'headphones', '#EF233C'), { rival: 'rex' }),
  p('mochi', 'Mochi Plays', '@mochiplays', 'gaming', 890_000, 'chill', 'Cozy games, cozier sweaters.',
    look(1, 'bun', 'pink', '#FFC8DD', '#BDE0FE', 'check', 'none', '#111'), { bff: 'sage' }),
  p('rex', 'Rex Clutch', '@rexclutch', 'gaming', 2_900_000, 'diva', 'Pro gamer. Three hundred actions a minute, two per conversation.',
    look(5, 'spiky', 'red', '#111111', '#E5383B', 'zip', 'headphones', '#E5383B'), { rival: 'ty' }),
  p('pia', 'Pixel Pia', '@pixelpia', 'gaming', 1_200_000, 'hungry', 'Streams ten hours a day. Has seen the sun twice.',
    look(3, 'long', 'purple', '#5A189A', '#E0AAFF', 'dots', 'headphones', '#E0AAFF')),
  p('gus', 'Gus 8Bit', '@gus8bit', 'gaming', 370_000, 'none', 'Blows into cartridges professionally.',
    look(0, 'curtain', 'brown', '#E76F51', '#264653', 'check', 'glasses', '#264653', { beard: true })),
  p('novavr', 'Nova VR', '@nova.vr', 'gaming', 560_000, 'chill', 'Lives in the metaverse. Visiting today.',
    look(6, 'bob', 'blue', '#4361EE', '#4CC9F0', 'zip', 'visor', '#4CC9F0')),

  // Tech
  p('sam', 'Sam Unbox', '@samunboxes', 'tech', 2_100_000, 'hustler', 'Has unboxed three thousand phones. Still uses a 2019 one.',
    look(2, 'fade', 'espresso', '#495057', '#ADB5BD', 'solid', 'glasses', '#212529', { beard: true }), { rival: 'omar' }),
  p('ada', 'Ada Prompt', '@adaprompt', 'tech', 980_000, 'none', 'Talks to robots. Robots talk back.',
    look(4, 'ponytail', 'black', '#00B4D8', '#CAF0F8', 'stripes', 'glasses', '#0077B6'), { bff: 'bri' }),
  p('leo', 'Leo Gadget', '@leogadget', 'tech', 1_500_000, 'none', 'Owns fourteen smartwatches. Wears three.',
    look(1, 'curtain', 'blonde', '#6C757D', '#F8F9FA', 'zip', 'none', '#111')),
  p('bri', 'Byte Bri', '@bytebri', 'tech', 430_000, 'chill', 'Codes in four languages, speaks one.',
    look(5, 'afro', 'purple', '#22223B', '#9A8C98', 'solid', 'glasses', '#9A8C98'), { bff: 'ada' }),
  p('omar', 'Omar Specs', '@omarspecs', 'tech', 3_300_000, 'diva', 'Reviews tech so you do not have to. Please subscribe.',
    look(3, 'waves', 'black', '#0B090A', '#E5383B', 'check', 'glasses', '#111111', { beard: true }), { rival: 'sam' }),
  p('skye', 'Skye Drone', '@skyedrone', 'tech', 290_000, 'none', 'Aerial shots only. Ground level is overrated.',
    look(0, 'ponytail', 'blonde', '#90E0EF', '#03045E', 'stripes', 'cap', '#03045E', { freckles: true })),

  // Fitness
  p('brick', 'Coach Brick', '@coachbrick', 'fitness', 2_600_000, 'hungry', 'Protein in every drink. Yes, every drink.',
    look(6, 'bald', 'black', '#F94144', '#FFFFFF', 'stripes', 'none', '#111', { beard: true }), { bff: 'duke' }),
  p('sage', 'Sage Flow', '@sageflow', 'fitness', 1_100_000, 'chill', 'Namaste. Namastay hydrated.',
    look(2, 'bun', 'auburn', '#B5E48C', '#52B69A', 'solid', 'none', '#111'), { bff: 'mochi' }),
  p('ivy', 'Ivy Miles', '@ivymiles', 'fitness', 520_000, 'none', 'Ran forty marathons. Running late to this one.',
    look(1, 'ponytail', 'copper', '#F3722C', '#F9C74F', 'zip', 'visor', '#F9C74F', { freckles: true })),
  p('blair', 'Blair Core', '@blaircore', 'fitness', 870_000, 'diva', 'Core of steel. Heart of gold. Matcha in hand.',
    look(0, 'ponytail', 'platinum', '#FFAFCC', '#CDB4DB', 'solid', 'shades', '#CDB4DB')),
  p('duke', 'Duke Jab', '@dukejab', 'fitness', 740_000, 'none', 'Boxer. Gentle unless you skip leg day.',
    look(7, 'buzz', 'black', '#023E8A', '#FFD60A', 'solid', 'none', '#111', { beard: true }), { bff: 'brick' }),
  p('tia', 'Tia Cardio', '@tiacardio', 'fitness', 1_800_000, 'selfie', 'Dance workouts. My neighbors hate me.',
    look(5, 'braids', 'blonde', '#F72585', '#4CC9F0', 'zip', 'bandana', '#4CC9F0')),

  // Foodie
  p('rocco', 'Chef Rocco', '@chefrocco', 'foodie', 2_300_000, 'diva', 'Will critique your appetizer with love.',
    look(1, 'waves', 'espresso', '#FFFFFF', '#E63946', 'solid', 'none', '#111', { beard: true }), { rival: 'momo' }),
  p('pippa', 'Pippa Bakes', '@pippabakes', 'foodie', 1_700_000, 'hungry', 'Cupcake therapist.',
    look(0, 'bun', 'blonde', '#FFC6FF', '#FFFFFC', 'dots', 'none', '#111', { freckles: true }), { bff: 'momo' }),
  p('raj', 'Raj Spice', '@rajspice', 'foodie', 890_000, 'none', 'Rates everything on a ten-pepper scale.',
    look(4, 'fade', 'black', '#D00000', '#FFBA08', 'check', 'none', '#111', { beard: true })),
  p('lily', 'Lily Greens', '@lilygreens', 'foodie', 640_000, 'chill', 'Plant-based. Plant parent. Plant person.',
    look(2, 'waves', 'auburn', '#55A630', '#AACC00', 'dots', 'none', '#111')),
  p('tony', 'Tony Tacos', '@tonytacos', 'foodie', 1_200_000, 'hungry', 'Reviews every taco truck in Clout City.',
    look(3, 'buzz', 'black', '#FFBA08', '#D00000', 'stripes', 'cap', '#D00000', { beard: true })),
  p('momo', 'Momo Eats', '@momoeats', 'foodie', 4_100_000, 'hungry', 'Eats on camera. Somehow still hungry.',
    look(1, 'bob', 'black', '#FFADAD', '#FFD6A5', 'dots', 'hoops', '#C0C0C0'), { bff: 'pippa', rival: 'rocco' }),
];

// Creators carry their stuff: selfie lovers and hustlers have a phone out,
// divas bring the bag, and some wear a smartwatch.
const PHONES = ['titanium', 'midnight', 'pink', 'gold'] as const;
const BAGS = ['quilted', 'monogram', 'mini', 'croc'] as const;
ROSTER.forEach((g, i) => {
  if (g.look.gear) return;
  const phone = g.trait === 'selfie' || g.trait === 'hustler' || i % 5 === 0 ? PHONES[i % PHONES.length] : undefined;
  const bag = g.trait === 'diva' || i % 7 === 3 ? BAGS[i % BAGS.length] : undefined;
  const watch = g.niche === 'fitness' || g.niche === 'tech' || i % 6 === 1 ? (['midnight', 'starlight', 'gold', 'pink'] as const)[i % 4] : undefined;
  g.look.gear = { phone, bag, watch };
});

export const ROSTER_BY_ID: Record<string, Profile> = Object.fromEntries(ROSTER.map((g) => [g.id, g]));

/**
 * The planners you can play as. Zara is the default; Kiki is in the Closet.
 * Gear and jewelry here are their starting looks; the Closet changes them.
 */
export const ZARA: Profile = p('zara', 'Zara Ellis', '@zaraplans', 'fashion', 12_000, 'none', 'Event planner to the stars. Gold hoops on, guest list memorized, never late.',
  {
    skin: '#D6A47C',
    hair: 'long',
    hairColor: '#22150F',
    top: '#EFE2D2',
    topAccent: '#C9A227',
    pattern: 'solid',
    acc: 'none',
    accColor: '#111111',
    lips: '#B06E68',
    eyes: '#4A2A17',
    makeup: 'glam',
    earrings: 'hoops',
    necklace: 'layered',
    neck: 'v',
    gear: { phone: 'titanium' },
  });

export const KIKI: Profile = p('kiki', 'Kiki Vance', '@kikiplans', 'fashion', 12_000, 'none', 'Event planner to the stars. Runs on cold brew and group chats.',
  look(3, 'ponytail', 'pink', '#1B1B1F', '#FF4D8D', 'solid', 'none', '#FF4D8D', { lips: '#E03174', gear: { headset: true } }));

export type PlannerId = 'zara' | 'kiki';
export const PLANNERS: Record<PlannerId, Profile> = { zara: ZARA, kiki: KIKI };

/** The rival planner: shows up uninvited in the plot twists. */
export const RHEA: Profile = p('rhea', 'Rhea Vale', '@rheavale', 'fashion', 2_900_000, 'diva', 'Rival planner. Lost the Bloom account. Has opinions about your seating chart.',
  {
    skin: '#F3C9A2',
    hair: 'bob',
    hairColor: '#1D1A1C',
    top: '#9B111E',
    topAccent: '#111111',
    pattern: 'solid',
    acc: 'none',
    accColor: '#111111',
    lips: '#9D0208',
    makeup: 'bold',
    earrings: 'drops',
    necklace: 'pendant',
    neck: 'scoop',
    gear: { phone: 'midnight', bag: 'croc' },
  },
  { dislikes: ['beauty', 'music'], likes: ['fashion'] });

/** Fills in the player's first name in story and feed lines. */
export function withMe(text: string, me: string): string {
  return text.replace(/\{me\}/g, me);
}

/** Chapter hosts. */
export const CLIENTS: Record<string, Profile> = {
  bella: p('bella', 'Bella Bloom', '@bellabloom', 'beauty', 8_200_000, 'diva', 'Launching Bloom Lip Oil tonight. Seven shades. Zero chill.',
    look(2, 'long', 'blonde', '#FF4D8D', '#FFD1E3', 'sequins', 'hoops', '#F5C542', { lips: '#E03174' })),
  coco: p('coco', 'Coco Vibes', '@cocovibes', 'comedy', 11_000_000, 'none', 'Runs the Vibe Villa: eight creators, one pool, zero privacy.',
    look(5, 'afro', 'copper', '#00BBF9', '#FEE440', 'stripes', 'shades', '#F15BB5')),
  marcus: p('marcus', 'Marcus "Mic Drop" Reyes', '@micdropmarcus', 'tech', 6_400_000, 'none', 'Host of Unfiltered Signal, the number-one podcast in Clout City.',
    look(3, 'fade', 'black', '#240046', '#FF9E00', 'solid', 'headphones', '#FF9E00', { beard: true })),
  nova: p('nova', 'DJ Nova', '@djnova', 'music', 15_000_000, 'diva', 'Headlining Glowfest. Sleeps after the encore.',
    look(1, 'spiky', 'mint', '#10002B', '#5EEAD4', 'sequins', 'headphones', '#5EEAD4')),
  sky: p('sky', 'Sky Sterling', '@skysterling', 'fashion', 52_000_000, 'diva', 'Most-followed creator in Clout City. Hosting the Golden Phone Awards afterparty.',
    look(6, 'waves', 'platinum', '#E9C46A', '#111111', 'sequins', 'crown', '#F5C542', { lips: '#9D0208' })),
};

/** "2.4M", "860K". */
export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

/** Big creators are worth more: 1× under 1M, 1.25× over 1M, 1.5× over 5M. */
export function starPower(followers: number): number {
  if (followers >= 5_000_000) return 1.5;
  if (followers >= 1_000_000) return 1.25;
  return 1;
}

/** How a guest feels about one tablemate, in hearts. */
export function chemistry(a: Profile, b: Profile): number {
  let h = 0;
  const likes = a.likes ?? NICHES[a.niche].likes;
  const dislikes = a.dislikes ?? NICHES[a.niche].dislikes;
  if (likes.includes(b.niche)) h += 1;
  if (dislikes.includes(b.niche)) h -= 1;
  if (a.bff === b.id) h += 1;
  if (a.rival === b.id) h -= 2;
  return h;
}
