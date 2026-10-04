import { DISHES, REQUESTS, ROSTER_BY_ID, STATIONS, TRAITS, TROUBLES, NICHE_WANTS, chemistry, starPower } from './content';
import { BAD, GOOD, GOOD_FOR, fill } from './feed';
import {
  BIN_STAND,
  ENTRANCE,
  PLAYER_START,
  ROUTER,
  ROUTER_STAND,
  STAGE_STAND,
  buildStations,
  buildTables,
  dist,
  findPath,
  obstaclesFor,
} from './layout';
import { chapterOf } from './levels';
import { between, mulberry32, pick, weighted } from './rng';
import type {
  Dish,
  GameState,
  Guest,
  Item,
  LevelDef,
  QueuedAction,
  RequestKind,
  Target,
  Trouble,
  TroubleKind,
  Upgrades,
  Vec,
} from './types';
import { effects, type Effects } from './upgrades';

/**
 * The In Crowd simulation. `createGame` builds a night, the seating
 * functions run the guest-list puzzle, and `step` advances the party.
 * Screens only read state and call `tap`/`seatGuest`/`selectLate`.
 */

const WALK = 200;
const GUEST_WALK = 95;
const MAX_QUEUE = 6;
const LIVE_WINDOW = 14;
const LIVE_LENGTH = 8;
const VIRAL_LENGTH = 10;

// ─── Setup ────────────────────────────────────────────────────────────────

export function createGame(level: LevelDef, upgrades: Upgrades, seed = Date.now()): GameState {
  const rng = mulberry32(seed);
  const eff = effects(upgrades);
  const { tables, seats } = buildTables(level.tables);
  const guests: Guest[] = level.cast.map((id, i) => {
    const profile = ROSTER_BY_ID[id];
    if (!profile) throw new Error(`Unknown guest ${id}`);
    const late = i >= level.guests;
    return {
      id,
      profile,
      seat: -1,
      pos: { ...ENTRANCE },
      mood: 3,
      state: late ? 'arriving' : 'waitingSeat',
      request: null,
      lastRequest: null,
      timer: 0,
      late,
      drama: null,
      love: 0,
      shake: 0,
      served: 0,
      walkTo: null,
      meal: null,
    };
  });
  // Late arrivals are spread through the middle of the night.
  const lateTimes: number[] = [];
  for (let i = 0; i < level.late; i++) {
    const at = level.duration * (0.12 + (0.7 * (i + 0.5)) / level.late) + between(rng, -4, 4);
    lateTimes.push(Math.max(8, at));
  }
  return {
    level,
    chapter: chapterOf(level),
    upgrades,
    phase: 'seating',
    seatingLeft: level.seatingTime,
    time: 0,
    clock: 0,
    rng,
    score: 0,
    breakdown: { seating: 0, service: 0, streaks: 0, troubles: 0, live: 0, viral: 0, late: 0, happy: 0, cleanFeed: 0, penalties: 0 },
    vibe: 0,
    viral: 0,
    streak: { cat: '', n: 0, best: 0 },
    guests,
    seats,
    tables,
    stations: buildStations(level.stations),
    kitchen: { cooking: [], ready: [] },
    troubles: [],
    nextTrouble: level.troubles ? level.troubles.first : Infinity,
    live: { state: 'idle', timer: 0, next: 0, done: 0, missed: 0 },
    lateQueue: [],
    lateTimes,
    selected: null,
    player: {
      pos: { ...PLAYER_START },
      path: [],
      queue: [],
      current: null,
      busy: null,
      hands: [],
      cap: eff.cap,
      speed: WALK * eff.speed,
      facing: 1,
      stride: 0,
      retries: 0,
    },
    fx: [],
    feed: [],
    events: [],
    stats: { served: 0, unfollows: 0, troubles: 0, lives: 0, seatedLate: 0, wrong: 0 },
    ids: 0,
  };
}

const nextId = (s: GameState) => ++s.ids;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const guestById = (s: GameState, id: string | null) => (id ? s.guests.find((g) => g.id === id) : undefined);
export const guestAtSeat = (s: GameState, seat: number) => guestById(s, s.seats[seat]?.guest ?? null);

function tablemates(s: GameState, table: number, except?: string): Guest[] {
  return s.seats
    .filter((seat) => seat.table === table && seat.guest && seat.guest !== except)
    .map((seat) => guestById(s, seat.guest) as Guest)
    .filter((g) => g && g.state !== 'leaving' && g.state !== 'gone');
}

// ─── Seating (the guest-list puzzle) ──────────────────────────────────────

/** Starting hearts for `guestId` if they sat at `seatId` (ignores where they sit now). */
export function previewMood(s: GameState, guestId: string, seatId: number): number {
  const g = guestById(s, guestId);
  const seat = s.seats[seatId];
  if (!g || !seat) return 0;
  let h = 3 + effects(s.upgrades).startMood;
  for (const other of tablemates(s, seat.table, guestId)) {
    if (other.id === seat.guest) continue; // they'd be swapped out
    h += chemistry(g.profile, other.profile);
  }
  return clamp(h, 1, 5);
}

function recomputeSeatingMoods(s: GameState) {
  const start = effects(s.upgrades).startMood;
  for (const g of s.guests) {
    if (g.seat < 0) continue;
    const table = s.seats[g.seat]?.table ?? -1;
    let h = 3 + start;
    for (const other of tablemates(s, table, g.id)) h += chemistry(g.profile, other.profile);
    g.mood = clamp(h, 1, 5);
  }
}

/** Seats a guest during seating. Tapping a taken seat swaps the two guests. */
export function seatGuest(s: GameState, guestId: string, seatId: number) {
  if (s.phase !== 'seating') return;
  const g = guestById(s, guestId);
  const seat = s.seats[seatId];
  if (!g || !seat || g.late) return;
  const from = g.seat;
  const other = guestById(s, seat.guest);
  if (other && other.id === g.id) return;
  if (from >= 0) (s.seats[from] as (typeof s.seats)[number]).guest = null;
  if (other) {
    if (from >= 0) {
      (s.seats[from] as (typeof s.seats)[number]).guest = other.id;
      other.seat = from;
      other.pos = { ...(s.seats[from] as (typeof s.seats)[number]).pos };
    } else {
      other.seat = -1;
      other.state = 'waitingSeat';
    }
  }
  seat.guest = g.id;
  g.seat = seatId;
  g.state = 'idle';
  g.pos = { ...seat.pos };
  recomputeSeatingMoods(s);
}

export function unseatGuest(s: GameState, guestId: string) {
  if (s.phase !== 'seating') return;
  const g = guestById(s, guestId);
  if (!g || g.seat < 0) return;
  (s.seats[g.seat] as (typeof s.seats)[number]).guest = null;
  g.seat = -1;
  g.state = 'waitingSeat';
  g.mood = 3;
  recomputeSeatingMoods(s);
}

export function unseated(s: GameState): Guest[] {
  return s.guests.filter((g) => !g.late && g.seat < 0);
}

/** Sum of everyone's starting hearts. */
export function seatingHearts(s: GameState): number {
  return s.guests.reduce((sum, g) => sum + (g.seat >= 0 && !g.late ? g.mood : 0), 0);
}

/** Opens the doors: anyone still unseated takes a random empty seat. */
export function startParty(s: GameState) {
  if (s.phase !== 'seating') return;
  const empty = s.seats.filter((seat) => !seat.guest);
  for (const g of unseated(s)) {
    const i = Math.floor(s.rng() * empty.length);
    const seat = empty.splice(i, 1)[0];
    if (!seat) break;
    seat.guest = g.id;
    g.seat = seat.id;
    g.pos = { ...seat.pos };
  }
  recomputeSeatingMoods(s);
  const timeBonus = Math.round(Math.max(0, s.seatingLeft) * 4);
  const heartBonus = Math.round(seatingHearts(s) * 10);
  s.breakdown.seating = timeBonus + heartBonus;
  s.score += s.breakdown.seating;
  for (const g of s.guests) {
    if (g.seat < 0) continue;
    g.state = 'idle';
    g.timer = between(s.rng, 1, 8);
  }
  s.phase = 'party';
  s.seatingLeft = 0;
  post(s, s.chapter.client.handle, `doors are open at ${s.chapter.place.split(',')[0]}. Let's GO`, 'news');
}

// ─── Taps during the party ───────────────────────────────────────────────

/** Late guest waiting at the rope: tap to pick them up, then tap an empty seat. */
export function selectLate(s: GameState, guestId: string) {
  const g = guestById(s, guestId);
  if (!g || g.state !== 'waitingSeat' || s.phase !== 'party') return;
  s.selected = s.selected === guestId ? null : guestId;
}

/** Queues a task for Kiki. Returns false when it was ignored. */
export function tap(s: GameState, target: Target): boolean {
  if (s.phase !== 'party') return false;
  if (target.kind === 'seat') {
    const seat = s.seats[target.seat];
    if (!seat) return false;
    if (s.selected && !seat.guest) {
      seatLate(s, s.selected, target.seat);
      return true;
    }
    if (!seat.guest) return false;
  }
  const p = s.player;
  if (p.queue.length + (p.current ? 1 : 0) >= MAX_QUEUE) {
    s.events.push({ kind: 'queueFull' });
    return false;
  }
  p.queue.push({ id: nextId(s), target });
  return true;
}

/** Numbers shown on targets so you can see your queue. */
export function queueOrder(s: GameState): { target: Target; n: number }[] {
  const list: QueuedAction[] = [...(s.player.current ? [s.player.current] : []), ...s.player.queue];
  return list.map((a, i) => ({ target: a.target, n: i + 1 }));
}

function seatLate(s: GameState, guestId: string, seatId: number) {
  const g = guestById(s, guestId);
  const seat = s.seats[seatId];
  if (!g || !seat || seat.guest || g.state !== 'waitingSeat') return;
  const eff = effects(s.upgrades);
  let h = 3 + eff.startMood;
  for (const other of tablemates(s, seat.table)) {
    h += chemistry(g.profile, other.profile);
    // Tablemates react to the newcomer too.
    other.mood = clamp(other.mood + chemistry(other.profile, g.profile) * 0.5, 0.3, 5);
  }
  if (g.mood < 2) h -= 1;
  g.mood = clamp(h, 1, 5);
  seat.guest = g.id;
  g.seat = seatId;
  g.state = 'walking';
  g.walkTo = { ...seat.pos };
  s.selected = null;
  s.lateQueue = s.lateQueue.filter((id) => id !== g.id);
  s.stats.seatedLate += 1;
  const pts = Math.round(50 * (0.6 + 0.12 * g.mood) * starPower(g.profile.followers));
  s.score += pts;
  s.breakdown.late += pts;
  addText(s, seat.pos, `+${pts}`, '#7CF29C');
}

// ─── The loop ─────────────────────────────────────────────────────────────

export function step(s: GameState, dtIn: number) {
  const dt = Math.min(dtIn, 0.1);
  s.clock += dt;
  updateFx(s, dt);
  if (s.phase === 'seating') {
    s.seatingLeft -= dt;
    if (s.seatingLeft <= 0) startParty(s);
    return;
  }
  if (s.phase !== 'party') return;
  s.time += dt;
  const eff = effects(s.upgrades);
  if (s.viral > 0) s.viral = Math.max(0, s.viral - dt);
  updateLate(s);
  updateTroubleSchedule(s);
  updateLive(s, dt);
  updateKitchen(s, dt);
  updateTroubles(s, dt, eff);
  updateGuests(s, dt, eff);
  updatePlayer(s, dt, eff);
  if (s.time >= s.level.duration) finish(s);
}

// ─── Guests ───────────────────────────────────────────────────────────────

function troubleDrain(s: GameState, g: Guest, eff: Effects): number {
  if (g.seat < 0) return 0;
  const table = s.seats[g.seat]?.table;
  let drain = 0;
  for (const t of s.troubles) {
    if (!t.active || t.leaving) continue;
    switch (t.kind) {
      case 'paparazzi':
        if (t.table === table) drain += 1.5;
        break;
      case 'troll':
        if (t.table === table) drain += 1.0;
        break;
      case 'spill':
        if (t.table === table) drain += 0.4;
        break;
      case 'drama':
        if (t.guests.includes(g.id)) drain += 2.5;
        else if (t.table === table) drain += 0.4;
        break;
      case 'wifi':
        drain += eff.wifiDrain;
        break;
    }
  }
  return drain;
}

function waitFactor(kind: RequestKind | undefined): number {
  if (kind === 'food') return 0.6;
  if (kind === 'plate') return 0.8;
  return 1;
}

function updateGuests(s: GameState, dt: number, eff: Effects) {
  const frozen = s.viral > 0 || s.live.state === 'onair';
  for (const g of s.guests) {
    g.love = Math.max(0, g.love - dt);
    g.shake = Math.max(0, g.shake - dt);
    if (g.state === 'walking' || g.state === 'leaving') {
      const to = g.walkTo ?? ENTRANCE;
      const d = dist(g.pos, to);
      const stepLen = GUEST_WALK * dt;
      if (d <= stepLen) {
        g.pos = { ...to };
        g.walkTo = null;
        if (g.state === 'leaving') g.state = 'gone';
        else {
          g.state = 'idle';
          g.timer = between(s.rng, 1.5, 4);
        }
      } else {
        g.pos = { x: g.pos.x + ((to.x - g.pos.x) / d) * stepLen, y: g.pos.y + ((to.y - g.pos.y) / d) * stepLen };
      }
      continue;
    }
    if (g.state === 'waitingSeat' && g.late) {
      if (!frozen) g.mood -= s.level.patience * 0.8 * eff.decay * dt;
      if (g.mood <= 0) storm(s, g, 'rope');
      continue;
    }
    if (g.seat < 0 || g.state === 'busy' || g.state === 'gone' || g.state === 'arriving' || g.state === 'waitingSeat') continue;
    const base = s.level.patience * TRAITS[g.profile.trait].patience * eff.decay;
    const drain = troubleDrain(s, g, eff);
    if (!frozen) {
      let loss = drain * base;
      if (g.state === 'want') loss += base * waitFactor(g.request?.kind);
      if (g.state === 'idle' && drain === 0) g.mood = Math.min(5, g.mood + 0.03 * dt);
      g.mood -= loss * dt;
    }
    if (g.request) g.request.age += dt;
    if (g.mood <= 0) {
      storm(s, g, 'seat');
      continue;
    }
    if (g.state === 'idle') {
      g.timer -= dt;
      if (g.timer <= 0) newRequest(s, g);
    } else if (g.state === 'eating') {
      g.timer -= dt;
      if (g.timer <= 0) {
        g.state = 'want';
        g.meal = null;
        g.request = { kind: 'plate', age: 0 };
      }
    }
  }
}

function newRequest(s: GameState, g: Guest) {
  const weights: Partial<Record<RequestKind, number>> = {};
  const wants = NICHE_WANTS[g.profile.niche];
  for (const key in s.level.requests) {
    const k = key as RequestKind;
    let w = (s.level.requests[k] ?? 0) * (wants[k] ?? 1);
    if (g.profile.trait === 'hungry' && k === 'order') w *= 2.2;
    if (g.profile.trait === 'selfie' && k === 'selfie') w *= 2.5;
    if (g.profile.trait === 'hustler' && k === 'contract') w *= 2.5;
    if (k === g.lastRequest) w *= 0.35;
    weights[k] = w;
  }
  const kind = weighted(s.rng, weights) ?? 'drink';
  g.request = { kind, age: 0, dish: kind === 'order' ? pick(s.rng, s.level.dishes.length ? s.level.dishes : (['avotoast'] as Dish[])) : undefined };
  g.lastRequest = kind;
  g.state = 'want';
}

/** Guest loses all patience: they unfollow and walk out. */
function storm(s: GameState, g: Guest, where: 'seat' | 'rope') {
  if (g.seat >= 0) {
    const seat = s.seats[g.seat];
    if (seat) seat.guest = null;
  }
  for (const t of s.troubles) {
    if (t.kind === 'drama' && t.guests.includes(g.id)) clearTrouble(s, t);
  }
  g.drama = null;
  g.request = null;
  g.mood = 0;
  g.state = 'leaving';
  g.walkTo = { ...ENTRANCE };
  if (s.selected === g.id) s.selected = null;
  s.lateQueue = s.lateQueue.filter((id) => id !== g.id);
  const penalty = where === 'rope' ? 40 : 60;
  s.score -= penalty;
  s.breakdown.penalties += penalty;
  s.vibe = Math.max(0, s.vibe - 25);
  s.streak.n = 0;
  s.streak.cat = '';
  s.stats.unfollows += 1;
  addText(s, g.pos, 'Unfollowed', '#FF5C7A', true);
  post(s, g.profile.handle, pick(s.rng, BAD), 'bad');
  s.events.push({ kind: 'unfollow', guest: g.id });
}

function updateLate(s: GameState) {
  while (s.lateTimes.length && s.time >= (s.lateTimes[0] as number)) {
    s.lateTimes.shift();
    const g = s.guests.find((x) => x.late && x.state === 'arriving');
    if (!g) break;
    g.state = 'waitingSeat';
    g.mood = 4;
    s.lateQueue.push(g.id);
    s.events.push({ kind: 'late', guest: g.id });
    post(s, g.profile.handle, 'just arrived. Fashionably late, as planned', 'news');
  }
  // Line up along the rope.
  s.lateQueue.forEach((id, i) => {
    const g = guestById(s, id);
    if (g && g.state === 'waitingSeat') g.pos = { x: ENTRANCE.x + 4 + i * 44, y: ENTRANCE.y - 40 };
  });
}

// ─── Kiki ─────────────────────────────────────────────────────────────────

function standFor(s: GameState, target: Target): Vec | null {
  switch (target.kind) {
    case 'station':
      return s.stations.find((st) => st.kind === target.station)?.stand ?? null;
    case 'seat':
      return s.seats[target.seat]?.stand ?? null;
    case 'stage':
      return STAGE_STAND;
    case 'bin':
      return BIN_STAND;
    case 'router':
      return ROUTER_STAND;
    case 'trouble': {
      const t = s.troubles.find((x) => x.id === target.id && !x.leaving);
      if (!t) return null;
      if (t.kind === 'wifi') return ROUTER_STAND;
      if (t.kind === 'drama') {
        const g = guestById(s, t.guests[0] ?? null);
        return g && g.seat >= 0 ? (s.seats[g.seat]?.stand ?? null) : null;
      }
      const at = t.dest ?? t.pos;
      return { x: at.x + (at.x < 200 ? 22 : -22), y: at.y + 2 };
    }
  }
}

function inSpill(s: GameState, pos: Vec): boolean {
  return s.troubles.some((t) => t.kind === 'spill' && t.active && dist(t.pos, pos) < 26);
}

function updatePlayer(s: GameState, dt: number, eff: Effects) {
  const p = s.player;
  p.cap = eff.cap;
  if (p.busy) {
    p.busy.left -= dt;
    if (p.busy.left <= 0) {
      const b = p.busy;
      p.busy = null;
      b.done();
    }
    return;
  }
  if (p.path.length) {
    let budget = p.speed * (inSpill(s, p.pos) ? 0.45 : 1) * dt;
    while (budget > 0 && p.path.length) {
      const to = p.path[0] as Vec;
      const d = dist(p.pos, to);
      if (Math.abs(to.x - p.pos.x) > 0.5) p.facing = to.x > p.pos.x ? 1 : -1;
      if (d <= budget) {
        p.pos = { ...to };
        p.path.shift();
        budget -= d;
        p.stride += d;
      } else {
        p.pos = { x: p.pos.x + ((to.x - p.pos.x) / d) * budget, y: p.pos.y + ((to.y - p.pos.y) / d) * budget };
        p.stride += budget;
        budget = 0;
      }
    }
    if (!p.path.length && p.current) arrive(s);
    return;
  }
  if (p.current) {
    arrive(s);
    return;
  }
  const next = p.queue.shift();
  if (!next) return;
  p.current = next;
  p.retries = 0;
  routeTo(s, next.target);
}

function routeTo(s: GameState, target: Target) {
  const p = s.player;
  const stand = standFor(s, target);
  if (!stand) {
    p.current = null;
    return;
  }
  p.path = dist(p.pos, stand) < 2 ? [] : findPath(p.pos, stand, obstaclesFor(s.tables));
}

function arrive(s: GameState) {
  const p = s.player;
  const action = p.current;
  if (!action) return;
  // Paparazzi move; follow them a couple of times.
  if (action.target.kind === 'trouble') {
    const stand = standFor(s, action.target);
    if (stand && dist(stand, p.pos) > 30 && p.retries < 3) {
      p.retries += 1;
      routeTo(s, action.target);
      return;
    }
  }
  p.current = null;
  perform(s, action.target);
}

function busy(s: GameState, label: string, seconds: number, at: Target, done: () => void) {
  s.player.busy = { label, left: seconds, total: seconds, at, done };
}

function sameItem(a: Item, b: Item): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'dish' && b.kind === 'dish') return a.dish === b.dish;
  return true;
}

function perform(s: GameState, target: Target) {
  const p = s.player;
  switch (target.kind) {
    case 'station': {
      const station = s.stations.find((st) => st.kind === target.station);
      if (!station) return;
      if (station.kind === 'kitchen') {
        // Dirty plates go back through the kitchen's dish return.
        dropPlates(s, station.stand);
        pickUpFood(s);
        return;
      }
      const item = STATIONS[station.kind].item;
      if (!item) return;
      if (p.hands.length >= p.cap) {
        handsFull(s);
        return;
      }
      busy(s, 'Grab', 0.25, target, () => {
        if (p.hands.length >= p.cap) return handsFull(s);
        p.hands.push({ kind: item });
        s.events.push({ kind: 'pickup', item: { kind: item } });
      });
      return;
    }
    case 'seat':
      serveSeat(s, target.seat, target);
      return;
    case 'trouble': {
      const t = s.troubles.find((x) => x.id === target.id && !x.leaving);
      if (!t) return;
      busy(s, TROUBLES[t.kind].fix, TROUBLES[t.kind].time, target, () => resolveTrouble(s, t, true));
      return;
    }
    case 'stage': {
      if (s.live.state !== 'warning') {
        addText(s, STAGE_STAND, s.live.state === 'onair' ? 'Already live' : 'Not live yet', '#FFFFFF');
        return;
      }
      s.live.state = 'setup';
      busy(s, 'Going live', 1.5, target, () => startLive(s));
      return;
    }
    case 'bin': {
      if (dropPlates(s, BIN_STAND)) {
        busy(s, 'Recycle', 0.3, target, () => undefined);
      } else if (p.hands.length) {
        p.hands.pop();
        addText(s, BIN_STAND, 'Tossed', '#FFFFFF');
      }
      return;
    }
    case 'router': {
      const t = s.troubles.find((x) => x.kind === 'wifi' && x.active);
      if (!t) {
        addText(s, ROUTER_STAND, 'Wi-Fi is fine', '#FFFFFF');
        return;
      }
      busy(s, 'Reboot', TROUBLES.wifi.time, target, () => resolveTrouble(s, t, true));
      return;
    }
  }
}

/** Puts down every dirty plate Kiki is carrying. Returns how many. */
function dropPlates(s: GameState, at: Vec): number {
  const p = s.player;
  const plates = p.hands.filter((i) => i.kind === 'plate').length;
  if (!plates) return 0;
  p.hands = p.hands.filter((i) => i.kind !== 'plate');
  const pts = plates * 10;
  s.score += pts;
  s.breakdown.service += pts;
  addText(s, { x: at.x, y: at.y - 20 }, `+${pts}`, '#7CF29C');
  return plates;
}

function handsFull(s: GameState) {
  addText(s, s.player.pos, 'Hands full', '#FFD166');
  s.events.push({ kind: 'handsFull' });
}

function pickUpFood(s: GameState) {
  const p = s.player;
  const k = s.kitchen;
  if (!k.ready.length) {
    addText(s, p.pos, k.cooking.length ? 'Still cooking' : 'No orders yet', '#FFFFFF');
    return;
  }
  if (p.hands.length >= p.cap) return handsFull(s);
  // Prefer dishes someone is actually waiting on and that you aren't already carrying.
  const waiting = s.guests
    .filter((g) => g.state === 'want' && g.request?.kind === 'food')
    .sort((a, b) => a.mood - b.mood)
    .map((g) => g.request?.dish as Dish);
  for (const item of p.hands) {
    if (item.kind !== 'dish') continue;
    const i = waiting.indexOf(item.dish);
    if (i >= 0) waiting.splice(i, 1);
  }
  let took = 0;
  while (p.hands.length < p.cap && k.ready.length) {
    let idx = k.ready.findIndex((d) => waiting.includes(d));
    if (idx < 0) {
      // Nobody needs what's left; still clear one stale dish off a full pass.
      if (took > 0) break;
      idx = 0;
    } else waiting.splice(waiting.indexOf(k.ready[idx] as Dish), 1);
    const dish = k.ready.splice(idx, 1)[0] as Dish;
    p.hands.push({ kind: 'dish', dish });
    took += 1;
  }
  busy(s, 'Pick up', 0.3, { kind: 'station', station: 'kitchen' }, () => undefined);
}

function serveSeat(s: GameState, seatId: number, target: Target) {
  const p = s.player;
  const g = guestAtSeat(s, seatId);
  if (!g || g.state === 'leaving' || g.state === 'gone' || g.state === 'walking') return;
  if (g.drama !== null) {
    const t = s.troubles.find((x) => x.id === g.drama);
    if (t) {
      busy(s, 'Mediate', TROUBLES.drama.time, target, () => resolveTrouble(s, t, true));
      return;
    }
  }
  if (g.state !== 'want' || !g.request) {
    addText(s, g.pos, 'All good', '#FFFFFF');
    return;
  }
  const req = g.request;
  switch (req.kind) {
    case 'selfie':
      g.state = 'busy';
      busy(s, 'Selfie', 1.1, target, () => {
        if (g.state !== 'busy') return;
        g.state = 'want';
        serve(s, g, 'selfie', REQUESTS.selfie.points);
      });
      return;
    case 'order':
      busy(s, 'Order', 0.5, target, () => {
        if (g.request?.kind !== 'order') return;
        const dish = g.request.dish ?? 'avotoast';
        s.kitchen.cooking.push({ dish, left: DISHES[dish].cook * effects(s.upgrades).cook, total: DISHES[dish].cook * effects(s.upgrades).cook });
        score(s, g, 'order', REQUESTS.order.points, 0.4);
        g.request = { kind: 'food', dish, age: 0 };
        g.state = 'want';
      });
      return;
    case 'food': {
      const i = p.hands.findIndex((it) => it.kind === 'dish' && it.dish === req.dish);
      if (i < 0) return wrong(s, g);
      busy(s, 'Serve', 0.3, target, () => {
        const j = p.hands.findIndex((it) => it.kind === 'dish' && it.dish === req.dish);
        if (j < 0 || g.request?.kind !== 'food') return;
        p.hands.splice(j, 1);
        score(s, g, 'food', REQUESTS.food.points, 1);
        g.meal = req.dish ?? null;
        g.request = null;
        g.state = 'eating';
        g.timer = between(s.rng, 5, 7);
      });
      return;
    }
    case 'plate':
      if (p.hands.length >= p.cap) return handsFull(s);
      busy(s, 'Clear', 0.35, target, () => {
        if (g.request?.kind !== 'plate' || p.hands.length >= p.cap) return;
        p.hands.push({ kind: 'plate' });
        serve(s, g, 'plate', REQUESTS.plate.points, 0.6);
      });
      return;
    default: {
      const want = { kind: req.kind } as Item;
      const i = p.hands.findIndex((it) => sameItem(it, want));
      if (i < 0) return wrong(s, g);
      busy(s, 'Serve', 0.3, target, () => {
        const j = p.hands.findIndex((it) => sameItem(it, want));
        if (j < 0 || g.request?.kind !== req.kind) return;
        p.hands.splice(j, 1);
        serve(s, g, req.kind, REQUESTS[req.kind].points);
      });
    }
  }
}

function wrong(s: GameState, g: Guest) {
  g.shake = 0.6;
  s.stats.wrong += 1;
  const want = g.request ? (g.request.kind === 'food' ? 'Wrong dish' : `Needs ${REQUESTS[g.request.kind].label.toLowerCase()}`) : 'Not that';
  addText(s, g.pos, want, '#FFD166');
  s.events.push({ kind: 'wrong', guest: g.id });
}

/** Clout for a task: base × happiness × star power × streak × viral. */
function score(s: GameState, g: Guest | null, cat: string, base: number, moodGain: number, bucket: 'service' | 'troubles' = 'service'): number {
  const eff = effects(s.upgrades);
  if (s.streak.cat === cat) s.streak.n += 1;
  else s.streak = { cat, n: 1, best: s.streak.best };
  s.streak.best = Math.max(s.streak.best, s.streak.n);
  const streakMult = Math.min(3, 1 + 0.25 * (s.streak.n - 1));
  const viralMult = s.viral > 0 ? 2 : 1;
  const moodMult = g ? 0.6 + 0.12 * g.mood : 1;
  const star = g ? starPower(g.profile.followers) * (g.profile.trait === 'diva' ? 1.5 : 1) : 1;
  const raw = base * moodMult * star;
  const withStreak = Math.round(raw * streakMult);
  const pts = Math.round(raw * streakMult * viralMult);
  s.breakdown[bucket] += Math.round(raw);
  s.breakdown.streaks += withStreak - Math.round(raw);
  s.breakdown.viral += pts - withStreak;
  s.score += pts;
  const at = g ? g.pos : s.player.pos;
  addText(s, { x: at.x, y: at.y - 30 }, `+${pts}`, viralMult > 1 ? '#FFD166' : '#FFFFFF');
  if (s.streak.n >= 2) {
    addText(s, { x: at.x, y: at.y - 52 }, `Streak ×${streakMult.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}`, '#FF8FD8');
    s.events.push({ kind: 'streak', n: s.streak.n });
  }
  if (g) {
    g.mood = Math.min(5, g.mood + moodGain + (moodGain >= 1 ? eff.serveBonus : 0));
    g.love = 1.3;
    s.vibe += 7 * (0.5 + g.mood / 5);
  } else {
    s.vibe += 6;
  }
  if (s.vibe >= 100 && s.viral <= 0) {
    s.vibe = 0;
    s.viral = VIRAL_LENGTH;
    s.events.push({ kind: 'viral' });
    addText(s, { x: 200, y: 330 }, 'GOING VIRAL', '#FFD166', true);
    post(s, '@cloutcitynews', '#TheInCrowd is trending in Clout City right now', 'news');
  }
  s.vibe = Math.min(100, s.vibe);
  return pts;
}

function serve(s: GameState, g: Guest, kind: RequestKind, base: number, moodGain = 1) {
  const pts = score(s, g, kind, base, moodGain);
  g.served += 1;
  s.stats.served += 1;
  g.request = null;
  g.state = 'idle';
  g.timer = between(s.rng, s.level.idle[0], s.level.idle[1]);
  s.events.push({ kind: 'serve', guest: g.id, points: pts });
  addFx(s, { kind: 'hearts', pos: { x: g.pos.x, y: g.pos.y - 18 }, ttl: 0.9 });
  if (s.rng() < 0.35) {
    const lines = GOOD_FOR[kind] ?? GOOD;
    post(s, g.profile.handle, fill(pick(s.rng, s.rng() < 0.6 ? lines : GOOD), { dish: 'food' }), 'good');
  }
}

// ─── Kitchen ──────────────────────────────────────────────────────────────

function updateKitchen(s: GameState, dt: number) {
  const k = s.kitchen;
  for (const c of k.cooking) c.left -= dt;
  while (k.cooking.length && (k.cooking[0] as { left: number }).left <= 0 && k.ready.length < 6) {
    const done = k.cooking.shift();
    if (done) k.ready.push(done.dish);
  }
  // Anything else finished out of order waits for room on the pass.
  for (let i = 0; i < k.cooking.length; i++) {
    const c = k.cooking[i];
    if (c && c.left <= 0 && k.ready.length < 6) {
      k.ready.push(c.dish);
      k.cooking.splice(i, 1);
      i -= 1;
    }
  }
}

// ─── Live moments ─────────────────────────────────────────────────────────

function updateLive(s: GameState, dt: number) {
  const L = s.live;
  if (L.state === 'idle') {
    const at = s.level.lives[L.next];
    if (at !== undefined && s.time >= at) {
      L.state = 'warning';
      L.timer = LIVE_WINDOW;
      L.next += 1;
      s.events.push({ kind: 'liveWarning' });
      post(s, s.chapter.client.handle, 'going LIVE in a few. Everybody look cute', 'news');
    }
  } else if (L.state === 'warning') {
    L.timer -= dt;
    if (L.timer <= 0) {
      L.state = 'idle';
      L.missed += 1;
      for (const g of s.guests) {
        if (g.seat >= 0 && (g.state === 'idle' || g.state === 'want' || g.state === 'eating')) g.mood = Math.max(0.4, g.mood - 1);
      }
      addText(s, { x: 200, y: 330 }, 'Missed the live', '#FF5C7A', true);
      post(s, s.chapter.client.handle, 'the stream started with nobody on stage. Awkward', 'bad');
      s.events.push({ kind: 'liveMissed' });
    }
  } else if (L.state === 'onair') {
    L.timer -= dt;
    if (L.timer <= 0) L.state = 'idle';
  }
}

function startLive(s: GameState) {
  const L = s.live;
  L.state = 'onair';
  L.timer = LIVE_LENGTH;
  L.done += 1;
  s.stats.lives += 1;
  let hearts = 0;
  for (const g of s.guests) {
    if (g.seat < 0 || g.state === 'leaving' || g.state === 'gone' || g.state === 'walking') continue;
    g.mood = Math.min(5, g.mood + 1);
    g.love = 1.6;
    hearts += g.mood;
  }
  const bonus = Math.round(150 + hearts * 5);
  s.score += bonus;
  s.breakdown.live += bonus;
  addText(s, { x: 200, y: 560 }, `LIVE  +${bonus}`, '#FF4D6D', true);
  const watching = Math.round((s.chapter.client.followers / 1000) * (0.02 + 0.01 * s.rng()));
  post(s, s.chapter.client.handle, `is LIVE with ${watching}K watching`, 'news');
  s.events.push({ kind: 'liveStart' });
}

// ─── Trouble ──────────────────────────────────────────────────────────────

function updateTroubleSchedule(s: GameState) {
  const cfg = s.level.troubles;
  if (!cfg || s.time < s.nextTrouble) return;
  s.nextTrouble = s.time + between(s.rng, cfg.every[0], cfg.every[1]);
  const live = s.troubles.filter((t) => !t.leaving).length;
  if (live >= cfg.max) return;
  const options = cfg.kinds.filter((k) => canSpawn(s, k));
  if (!options.length) return;
  spawnTrouble(s, pick(s.rng, options));
}

function seatedAt(s: GameState, table: number): Guest[] {
  return tablemates(s, table).filter((g) => g.state !== 'walking');
}

function busyTables(s: GameState): number[] {
  return s.tables.map((t) => t.id).filter((id) => seatedAt(s, id).length > 0 && !s.troubles.some((t) => t.table === id && !t.leaving));
}

function canSpawn(s: GameState, kind: TroubleKind): boolean {
  if (kind === 'wifi') return !s.troubles.some((t) => t.kind === 'wifi');
  if (kind === 'drama') return s.tables.some((t) => seatedAt(s, t.id).filter((g) => g.drama === null).length >= 2);
  return busyTables(s).length > 0;
}

export function spawnTrouble(s: GameState, kind: TroubleKind) {
  const id = nextId(s);
  const base: Trouble = { id, kind, pos: { x: 200, y: 400 }, dest: null, table: -1, guests: [], age: 0, active: true, leaving: false };
  if (kind === 'wifi') {
    base.pos = { ...ROUTER };
  } else if (kind === 'drama') {
    // The worst pair in the room starts it.
    let best: { a: Guest; b: Guest; score: number } | null = null;
    for (const t of s.tables) {
      const people = seatedAt(s, t.id).filter((g) => g.drama === null);
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const a = people[i] as Guest;
          const b = people[j] as Guest;
          const sc = chemistry(a.profile, b.profile) + chemistry(b.profile, a.profile) + s.rng() * 1.5;
          if (!best || sc < best.score) best = { a, b, score: sc };
        }
      }
    }
    if (!best) return;
    base.table = s.seats[best.a.seat]?.table ?? -1;
    base.guests = [best.a.id, best.b.id];
    base.pos = { x: (best.a.pos.x + best.b.pos.x) / 2, y: Math.min(best.a.pos.y, best.b.pos.y) - 46 };
    best.a.drama = id;
    best.b.drama = id;
  } else {
    const tables = busyTables(s);
    if (!tables.length) return;
    const tableId = pick(s.rng, tables);
    const table = s.tables[tableId];
    if (!table) return;
    base.table = tableId;
    const front = { x: table.pos.x + pick(s.rng, [-46, 0, 46]), y: table.pos.y + 48 };
    if (kind === 'paparazzi') {
      base.pos = { ...ENTRANCE };
      base.dest = front;
      base.active = false;
    } else if (kind === 'spill') {
      base.pos = { x: table.pos.x + between(s.rng, -55, 55), y: table.pos.y + 56 };
    } else {
      base.pos = front;
    }
  }
  s.troubles.push(base);
  s.events.push({ kind: 'trouble', trouble: kind });
  post(s, '@cloutcitynews', TROUBLES[kind].news, 'news');
}

function updateTroubles(s: GameState, dt: number, eff: Effects) {
  for (const t of [...s.troubles]) {
    t.age += dt;
    if (t.leaving) {
      const d = dist(t.pos, ENTRANCE);
      const stepLen = 120 * dt;
      if (d <= stepLen) s.troubles = s.troubles.filter((x) => x !== t);
      else t.pos = { x: t.pos.x + ((ENTRANCE.x - t.pos.x) / d) * stepLen, y: t.pos.y + ((ENTRANCE.y - t.pos.y) / d) * stepLen };
      continue;
    }
    if (t.kind === 'paparazzi' && !t.active && t.dest) {
      const d = dist(t.pos, t.dest);
      const stepLen = 70 * dt;
      if (d <= stepLen) {
        t.pos = { ...t.dest };
        t.active = true;
        t.age = 0;
      } else t.pos = { x: t.pos.x + ((t.dest.x - t.pos.x) / d) * stepLen, y: t.pos.y + ((t.dest.y - t.pos.y) / d) * stepLen };
      continue;
    }
    if (t.kind === 'paparazzi' && t.active && Math.floor(t.age / 1.3) !== Math.floor((t.age - dt) / 1.3)) {
      addFx(s, { kind: 'flash', pos: { x: t.pos.x, y: t.pos.y - 30 }, ttl: 0.35 });
    }
    if ((t.kind === 'paparazzi' || t.kind === 'troll') && t.active && t.age >= eff.guard) {
      addText(s, t.pos, 'Bodyguard!', '#9BE7FF');
      resolveTrouble(s, t, false);
    } else if (t.kind === 'wifi' && t.age >= eff.wifiAuto) {
      addText(s, t.pos, 'Mesh Wi-Fi', '#9BE7FF');
      resolveTrouble(s, t, false);
    } else if (t.kind === 'drama' && t.guests.some((id) => guestById(s, id)?.drama !== t.id)) {
      clearTrouble(s, t);
    }
  }
}

function clearTrouble(s: GameState, t: Trouble) {
  for (const id of t.guests) {
    const g = guestById(s, id);
    if (g && g.drama === t.id) g.drama = null;
  }
  s.troubles = s.troubles.filter((x) => x !== t);
}

function resolveTrouble(s: GameState, t: Trouble, byPlayer: boolean) {
  if (!s.troubles.includes(t) || t.leaving) return;
  if (byPlayer) {
    score(s, null, 'trouble', TROUBLES[t.kind].points, 0, 'troubles');
    s.stats.troubles += 1;
  }
  // Everyone it was bothering cheers up a little.
  for (const g of s.guests) {
    if (g.seat < 0 || g.state === 'leaving' || g.state === 'gone') continue;
    const table = s.seats[g.seat]?.table;
    if (t.guests.includes(g.id)) g.mood = Math.min(5, g.mood + 0.75);
    else if (t.kind === 'wifi' || table === t.table) g.mood = Math.min(5, g.mood + 0.3);
  }
  if (t.kind === 'paparazzi') {
    t.leaving = true;
    t.active = false;
    t.dest = null;
  } else {
    clearTrouble(s, t);
  }
  s.events.push({ kind: 'fixed', trouble: t.kind });
}

// ─── Ending ───────────────────────────────────────────────────────────────

function finish(s: GameState) {
  s.phase = 'done';
  s.player.queue = [];
  s.player.path = [];
  s.player.busy = null;
  s.player.current = null;
  let happy = 0;
  for (const g of s.guests) {
    if (g.seat >= 0 && g.state !== 'leaving' && g.state !== 'gone') happy += Math.round(g.mood * 15);
  }
  s.breakdown.happy = happy;
  s.breakdown.cleanFeed = s.stats.unfollows === 0 ? 300 : 0;
  s.score += happy + s.breakdown.cleanFeed;
  s.events.push({ kind: 'end' });
}

export function starsFor(level: LevelDef, score: number): 0 | 1 | 2 | 3 {
  if (score >= level.expert) return 3;
  if (score >= Math.round((level.goal + level.expert) / 2)) return 2;
  if (score >= level.goal) return 1;
  return 0;
}

// ─── Effects and the feed ─────────────────────────────────────────────────

function addFx(s: GameState, fx: { kind: 'burst' | 'flash' | 'hearts'; pos: Vec; ttl: number; color?: string }) {
  if (fx.kind === 'burst') s.fx.push({ id: nextId(s), kind: 'burst', pos: fx.pos, color: fx.color ?? '#FFFFFF', age: 0, ttl: fx.ttl });
  else s.fx.push({ id: nextId(s), kind: fx.kind, pos: fx.pos, age: 0, ttl: fx.ttl });
  if (s.fx.length > 40) s.fx.shift();
}

function addText(s: GameState, pos: Vec, text: string, color: string, big = false) {
  s.fx.push({ id: nextId(s), kind: 'text', pos: { ...pos }, text, color, age: 0, ttl: big ? 1.8 : 1.1, big });
  if (s.fx.length > 40) s.fx.shift();
}

function updateFx(s: GameState, dt: number) {
  for (const f of s.fx) f.age += dt;
  s.fx = s.fx.filter((f) => f.age < f.ttl);
}

function post(s: GameState, handle: string, text: string, tone: 'good' | 'bad' | 'news') {
  s.feed.push({ id: nextId(s), handle, text, tone, t: s.time });
  if (s.feed.length > 8) s.feed.shift();
}

/** Kiki's own follower gain for a night: clout turns into followers. */
export function followersGained(score: number, stars: number): number {
  return Math.max(0, Math.round(score * 24 + stars * 15_000));
}

/** Coins for the shop. */
export function coinsEarned(score: number, stars: number): number {
  return Math.max(0, Math.round(score / 20) + stars * 40);
}

