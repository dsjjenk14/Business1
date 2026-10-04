import { STATIONS } from './content';
import { guestAtSeat, guestById, previewMood, seatGuest, seatingHearts, selectLate, startParty, tap, unseated } from './game';
import { dist } from './layout';
import type { GameState, Guest, StationKind, Target, Vec } from './types';

/**
 * A greedy autopilot. It's how Goal and Expert scores were tuned: it plays
 * every level many times and the thresholds sit below its average. It's
 * also handy for a "watch it play" demo.
 */

const ITEM_STATION: Partial<Record<string, StationKind>> = Object.fromEntries(
  (Object.keys(STATIONS) as StationKind[]).filter((k) => STATIONS[k].item).map((k) => [STATIONS[k].item as string, k]),
);

/** Arranges the guest list for the most total hearts (greedy fill, then swaps). */
export function botSeat(s: GameState) {
  for (const g of unseated(s)) {
    let best = -1;
    let bestMood = -Infinity;
    for (const seat of s.seats) {
      if (seat.guest) continue;
      const m = previewMood(s, g.id, seat.id) + s.rng() * 0.01;
      if (m > bestMood) {
        bestMood = m;
        best = seat.id;
      }
    }
    if (best >= 0) seatGuest(s, g.id, best);
  }
  const seated = () => s.guests.filter((g) => !g.late && g.seat >= 0);
  let total = seatingHearts(s);
  for (let i = 0; i < 400; i++) {
    const list = seated();
    const a = list[Math.floor(s.rng() * list.length)];
    const seatB = s.seats[Math.floor(s.rng() * s.seats.length)];
    if (!a || !seatB || s.seats[a.seat]?.table === seatB.table) continue;
    const from = a.seat;
    seatGuest(s, a.id, seatB.id);
    const next = seatingHearts(s);
    if (next >= total) total = next;
    else {
      // Undo: put a back (this swaps the other guest back too).
      seatGuest(s, a.id, from);
    }
  }
}

function standOf(s: GameState, t: Target): Vec {
  switch (t.kind) {
    case 'station':
      return s.stations.find((st) => st.kind === t.station)?.stand ?? s.player.pos;
    case 'seat':
      return s.seats[t.seat]?.stand ?? s.player.pos;
    case 'trouble':
      return s.troubles.find((x) => x.id === t.id)?.pos ?? s.player.pos;
    default:
      return { x: 200, y: 610 };
  }
}

function holding(s: GameState, kind: string, dish?: string) {
  return s.player.hands.some((i) => i.kind === kind && (!dish || (i.kind === 'dish' && i.dish === dish)));
}

function chooseAction(s: GameState): Target | null {
  const p = s.player;
  if (s.live.state === 'warning') return { kind: 'stage' };
  const trouble = s.troubles
    .filter((t) => !t.leaving)
    .sort((a, b) => dist(p.pos, a.dest ?? a.pos) - dist(p.pos, b.dest ?? b.pos))[0];
  if (trouble) return { kind: 'trouble', id: trouble.id };

  const full = p.hands.length >= p.cap;
  let best: { target: Target; value: number } | null = null;
  const consider = (target: Target, urgency: number, bonus = 0) => {
    const value = urgency * 10 + bonus - dist(p.pos, standOf(s, target)) / 60;
    if (!best || value > best.value) best = { target, value };
  };

  for (const g of s.guests as Guest[]) {
    if (g.state !== 'want' || !g.request || g.seat < 0) continue;
    const urgency = 1 / (g.mood + 0.4);
    const seat: Target = { kind: 'seat', seat: g.seat };
    const r = g.request;
    switch (r.kind) {
      case 'selfie':
      case 'order':
        consider(seat, urgency);
        break;
      case 'plate':
        if (!full) consider(seat, urgency * 0.8);
        break;
      case 'food':
        if (holding(s, 'dish', r.dish)) consider(seat, urgency, 4);
        else if (!full && s.kitchen.ready.includes(r.dish as never)) consider({ kind: 'station', station: 'kitchen' }, urgency);
        break;
      default: {
        if (holding(s, r.kind)) consider(seat, urgency, 4);
        else if (!full) {
          const st = ITEM_STATION[r.kind];
          // Don't fetch a second one if someone else's is already in hand.
          if (st) consider({ kind: 'station', station: st }, urgency * 0.9);
        }
      }
    }
  }
  if (best) return (best as { target: Target }).target;
  if (p.hands.some((i) => i.kind === 'plate') || full) {
    const kitchen = s.stations.find((st) => st.kind === 'kitchen');
    const bin = { x: 356, y: 610 };
    return kitchen && dist(p.pos, kitchen.stand) < dist(p.pos, bin) ? { kind: 'station', station: 'kitchen' } : { kind: 'bin' };
  }
  return null;
}

/** How many guests want `item` beyond what the planner already carries. */
function demandFor(s: GameState, item: string): number {
  const wanting = s.guests.filter((g) => g.state === 'want' && g.request?.kind === item).length;
  const held = s.player.hands.filter((i) => i.kind === item).length;
  return Math.max(0, wanting - held);
}

/** One decision. Call every frame; it only acts when the planner is free. */
export function botThink(s: GameState) {
  if (s.phase === 'seating') {
    botSeat(s);
    startParty(s);
    return;
  }
  if (s.phase !== 'party') return;
  for (const id of [...s.lateQueue]) {
    const g = guestById(s, id);
    if (!g) continue;
    let best = -1;
    let bestMood = -Infinity;
    for (const seat of s.seats) {
      if (seat.guest) continue;
      const m = previewMood(s, id, seat.id);
      if (m > bestMood) {
        bestMood = m;
        best = seat.id;
      }
    }
    if (best < 0) break;
    selectLate(s, id);
    tap(s, { kind: 'seat', seat: best });
  }
  const p = s.player;
  if (p.busy || p.current || p.queue.length || p.path.length) return;
  const target = chooseAction(s);
  if (!target) return;
  if (target.kind === 'seat' && !guestAtSeat(s, target.seat)) return;
  if (target.kind === 'station' && target.station !== 'kitchen') {
    // Grab one for everybody who wants the same thing, like a good player would.
    const item = STATIONS[target.station].item as string;
    const n = Math.max(1, Math.min(p.cap - p.hands.length, demandFor(s, item)));
    for (let i = 0; i < n; i++) tap(s, target);
    return;
  }
  tap(s, target);
}
