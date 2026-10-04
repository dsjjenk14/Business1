/**
 * The In Crowd: the shapes everything in the game shares.
 *
 * The engine is plain TypeScript with no React or React Native imports, so
 * the same code runs in the app and in the headless balance bot
 * (`scripts/in-crowd-balance.mjs`).
 */

export type Vec = { x: number; y: number };

/** What a creator posts about. Seating chemistry is built on these. */
export type Niche = 'beauty' | 'fashion' | 'music' | 'comedy' | 'gaming' | 'tech' | 'fitness' | 'foodie';

/** The service counters along the back wall. */
export type StationKind = 'kitchen' | 'bar' | 'charge' | 'glam' | 'light' | 'pr';

export type Dish = 'avotoast' | 'sushi' | 'cupcake' | 'acai';

/** Things you grab from a counter and hand to whoever asked. */
export type SimpleItem = 'drink' | 'charger' | 'glam' | 'light' | 'contract';

export type Item = { kind: SimpleItem } | { kind: 'dish'; dish: Dish } | { kind: 'plate' };

/**
 * What a seated guest can want.
 * order → (you take it) → food → (you serve it, they eat) → plate → (you clear it).
 */
export type RequestKind = SimpleItem | 'selfie' | 'order' | 'food' | 'plate';

export type Request = { kind: RequestKind; dish?: Dish; age: number };

export type TroubleKind = 'paparazzi' | 'troll' | 'drama' | 'wifi' | 'spill' | 'blackout';

/** Surprises that hit mid-night. */
export type TwistKind = 'heatwave' | 'deadphones' | 'selfierush' | 'glamcrisis' | 'crasher' | 'leak' | 'blackout' | 'chefquits' | 'sponsor';

/** A line in a story scene. `who` is a profile id ('me' is the player's planner, 'leaks' the anonymous account). */
export type StoryLine = { who: string; text: string };

export type Scene = { lines: StoryLine[]; twist?: boolean };

/** Personality: changes how fast they lose patience and what they ask for. */
export type Trait = 'chill' | 'diva' | 'hungry' | 'selfie' | 'hustler' | 'none';

export type HairStyle = 'bun' | 'long' | 'bob' | 'afro' | 'buzz' | 'fade' | 'ponytail' | 'braids' | 'waves' | 'spiky' | 'bald' | 'curtain';
export type Accessory = 'none' | 'shades' | 'glasses' | 'headphones' | 'beanie' | 'cap' | 'hoops' | 'bandana' | 'crown' | 'visor';
export type Pattern = 'solid' | 'stripes' | 'dots' | 'sequins' | 'check' | 'zip';

export type Look = {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  top: string;
  topAccent: string;
  pattern: Pattern;
  acc: Accessory;
  accColor: string;
  /** Lipstick; leaving it out gives a natural lip for their skin tone. */
  lips?: string;
  beard?: boolean;
  freckles?: boolean;
  /** Iris color; picked from their look when left out. */
  eyes?: string;
  /** Defined lashes; on by default unless they have a beard or a very short cut. */
  lashes?: boolean;
  /** Neckline; follows the outfit pattern when left out. */
  neck?: 'crew' | 'v' | 'collar' | 'hood' | 'scoop';
  /** natural (default), glam (mascara, liner, shimmer, highlighter) or bold (dramatic wing). */
  makeup?: 'natural' | 'glam' | 'bold';
  /** Gold jewelry. */
  earrings?: 'hoops' | 'studs' | 'drops';
  necklace?: 'chain' | 'layered' | 'pendant';
  /** Things they carry or wear: drawn on portraits and on the planner. */
  gear?: Gear;
};

export type PhoneFinish = 'titanium' | 'midnight' | 'pink' | 'gold';
export type WatchBand = 'midnight' | 'starlight' | 'gold' | 'pink';
export type BagKind = 'quilted' | 'monogram' | 'mini' | 'croc';

export type Gear = {
  phone?: PhoneFinish;
  watch?: WatchBand;
  bag?: BagKind;
  /** A slim earpiece with a mic: the planner's headset. */
  headset?: boolean;
};

/** A creator in the roster. */
export type Profile = {
  id: string;
  name: string;
  handle: string;
  niche: Niche;
  followers: number;
  bio: string;
  trait: Trait;
  look: Look;
  /** Overrides the niche's default chemistry. */
  likes?: Niche[];
  dislikes?: Niche[];
  /** Someone they love sitting with (+1 heart). */
  bff?: string;
  /** Someone they can't stand (−2 hearts). */
  rival?: string;
};

export type GuestState = 'arriving' | 'waitingSeat' | 'walking' | 'idle' | 'want' | 'busy' | 'eating' | 'leaving' | 'gone';

export type Guest = {
  id: string;
  profile: Profile;
  seat: number;
  pos: Vec;
  /** Patience, in hearts: 0–5. At 0 they unfollow and leave. */
  mood: number;
  state: GuestState;
  request: Request | null;
  lastRequest: RequestKind | null;
  /** Seconds left of idling / eating / walking. */
  timer: number;
  /** For late arrivals waiting at the rope. */
  late: boolean;
  /** Drama this guest is part of (trouble id), if any. */
  drama: number | null;
  /** Seconds left of the little hearts-for-eyes reaction after being served. */
  love: number;
  /** Seconds left of the head shake when you bring the wrong thing. */
  shake: number;
  /** A party crasher from a plot twist: worth more seated, costs more if they walk. */
  vip: boolean;
  served: number;
  walkTo: Vec | null;
  /** What's on their plate while they eat. */
  meal: Dish | null;
};

export type Seat = { id: number; table: number; pos: Vec; stand: Vec; guest: string | null };

export type Table = { id: number; slot: number; pos: Vec };

export type Station = { kind: StationKind; pos: Vec; stand: Vec };

export type Target =
  | { kind: 'station'; station: StationKind }
  | { kind: 'seat'; seat: number }
  | { kind: 'trouble'; id: number }
  | { kind: 'stage' }
  | { kind: 'bin' }
  | { kind: 'router' };

export type QueuedAction = { id: number; target: Target };

export type Busy = { label: string; left: number; total: number; done: () => void; at: Target };

export type Player = {
  pos: Vec;
  path: Vec[];
  queue: QueuedAction[];
  current: QueuedAction | null;
  busy: Busy | null;
  hands: Item[];
  cap: number;
  speed: number;
  facing: 1 | -1;
  /** Advances while walking; drives the leg swing. */
  stride: number;
  /** Re-path attempts for moving targets (paparazzi). */
  retries: number;
};

export type Trouble = {
  id: number;
  kind: TroubleKind;
  pos: Vec;
  /** Paparazzi walk in before they start shooting. */
  dest: Vec | null;
  table: number;
  guests: string[];
  age: number;
  active: boolean;
  leaving: boolean;
};

export type Fx =
  | { id: number; kind: 'text'; pos: Vec; text: string; color: string; age: number; ttl: number; big?: boolean }
  | { id: number; kind: 'burst'; pos: Vec; color: string; age: number; ttl: number }
  | { id: number; kind: 'flash'; pos: Vec; age: number; ttl: number }
  | { id: number; kind: 'hearts'; pos: Vec; age: number; ttl: number };

export type FeedPost = { id: number; handle: string; text: string; tone: 'good' | 'bad' | 'news'; t: number };

/** One-shot notices for the screen: haptics, banners, tips. */
export type GameEvent =
  | { kind: 'serve'; guest: string; points: number }
  | { kind: 'wrong'; guest: string }
  | { kind: 'handsFull' }
  | { kind: 'pickup'; item: Item }
  | { kind: 'unfollow'; guest: string }
  | { kind: 'trouble'; trouble: TroubleKind }
  | { kind: 'fixed'; trouble: TroubleKind }
  | { kind: 'liveWarning' }
  | { kind: 'liveStart' }
  | { kind: 'liveMissed' }
  | { kind: 'viral' }
  | { kind: 'streak'; n: number }
  | { kind: 'late'; guest: string }
  | { kind: 'queueFull' }
  | { kind: 'twist'; twist: TwistKind; title: string; text: string; short: string }
  | { kind: 'end' };

export type Breakdown = {
  seating: number;
  service: number;
  streaks: number;
  troubles: number;
  live: number;
  viral: number;
  late: number;
  happy: number;
  cleanFeed: number;
  sponsor: number;
  penalties: number;
};

export type Upgrades = Record<UpgradeId, number>;

export type UpgradeId = 'sneakers' | 'tote' | 'dj' | 'chef' | 'bodyguard' | 'glamsquad' | 'powerbank' | 'mesh';

export type TipId =
  | 'seating'
  | 'bar'
  | 'charge'
  | 'glam'
  | 'light'
  | 'pr'
  | 'selfie'
  | 'kitchen'
  | 'plates'
  | 'streak'
  | 'viral'
  | 'live'
  | 'paparazzi'
  | 'troll'
  | 'drama'
  | 'wifi'
  | 'spill'
  | 'late'
  | 'twists'
  | 'blackout'
  | 'crasher';

export type LevelDef = {
  id: string;
  chapter: number;
  index: number;
  name: string;
  blurb: string;
  tables: number;
  guests: number;
  late: number;
  /** Party length in seconds. */
  duration: number;
  seatingTime: number;
  stations: StationKind[];
  dishes: Dish[];
  requests: Partial<Record<RequestKind, number>>;
  /** Hearts lost per second while a guest waits. */
  patience: number;
  /** Seconds a guest chills between requests. */
  idle: [number, number];
  troubles: { kinds: TroubleKind[]; first: number; every: [number, number]; max: number } | null;
  /** Party-clock seconds when the host goes live. */
  lives: number[];
  goal: number;
  expert: number;
  tips: TipId[];
  /** Who's invited (roster ids). */
  cast: string[];
  /** Mid-night surprises, by party-clock second. */
  twists: { at: number; kind: TwistKind }[];
  /** Story scenes before and after this night (plot twists live here). */
  before?: Scene;
  after?: Scene;
  /** 1 = first night; climbs every night. Shown on the level card. */
  heat: number;
};

export type Chapter = {
  id: number;
  venue: VenueId;
  title: string;
  place: string;
  client: Profile;
  intro: string[];
  outro: string;
};

export type VenueId = 'rooftop' | 'villa' | 'studio' | 'festival' | 'gala';

export type LiveState = { state: 'idle' | 'warning' | 'setup' | 'onair'; timer: number; next: number; done: number; missed: number };

export type GameState = {
  level: LevelDef;
  chapter: Chapter;
  upgrades: Upgrades;
  phase: 'seating' | 'party' | 'done';
  seatingLeft: number;
  time: number;
  /** Real seconds since the level started, for animations. */
  clock: number;
  rng: () => number;
  score: number;
  breakdown: Breakdown;
  vibe: number;
  viral: number;
  streak: { cat: string; n: number; best: number };
  guests: Guest[];
  seats: Seat[];
  tables: Table[];
  stations: Station[];
  kitchen: { cooking: { dish: Dish; left: number; total: number }[]; ready: Dish[] };
  troubles: Trouble[];
  nextTrouble: number;
  live: LiveState;
  lateQueue: string[];
  lateTimes: number[];
  selected: string | null;
  player: Player;
  fx: Fx[];
  feed: FeedPost[];
  events: GameEvent[];
  stats: { served: number; unfollows: number; troubles: number; lives: number; seatedLate: number; wrong: number; twists: number };
  ids: number;
  /** The player's planner, by first name, for feed posts. */
  me: string;
  twistNext: number;
  /** Seconds left: kitchen closed (chef walked out). */
  chefGone: number;
  /** Seconds left: a sponsor pays 1.5× clout. */
  sponsor: number;
};
