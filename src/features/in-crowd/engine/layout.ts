import type { Seat, Station, StationKind, Table, Vec } from './types';

/**
 * The floor plan. Everything is in world units on a 400 × 700 portrait
 * board; the screen scales the whole board to fit the phone.
 *
 *   back wall   six counters (kitchen, bar, chargers, glam, ring lights, PR)
 *   floor       up to six banquet tables, two per row, four seats each
 *   front       velvet rope (late guests), router, the live stage, recycling
 */
export const WORLD = { w: 400, h: 700 } as const;

/** Where each counter always sits, so muscle memory carries between levels. */
const STATION_X: Record<StationKind, number> = { kitchen: 38, bar: 103, charge: 168, glam: 232, light: 297, pr: 362 };
export const STATION_Y = 56;
export const STAND_Y = 122;

export const TABLE_W = 156;
export const TABLE_SLOTS: Vec[] = [
  { x: 102, y: 236 },
  { x: 298, y: 236 },
  { x: 102, y: 386 },
  { x: 298, y: 386 },
  { x: 102, y: 536 },
  { x: 298, y: 536 },
];
/** Four seats behind each table, guests facing you. */
export const SEAT_OFFSETS = [-57, -19, 19, 57];
export const SEAT_DY = -22;
export const STAND_DY = 42;

export const ENTRANCE: Vec = { x: 34, y: 646 };
export const ROUTER: Vec = { x: 116, y: 662 };
export const STAGE: Vec = { x: 212, y: 640 };
export const BIN: Vec = { x: 362, y: 648 };
export const STAGE_STAND: Vec = { x: 212, y: 604 };
export const BIN_STAND: Vec = { x: 356, y: 610 };
export const ROUTER_STAND: Vec = { x: 116, y: 618 };
export const ENTRANCE_STAND: Vec = { x: 40, y: 610 };
export const PLAYER_START: Vec = { x: 200, y: 160 };

export function buildStations(kinds: StationKind[]): Station[] {
  return kinds.map((kind) => ({ kind, pos: { x: STATION_X[kind], y: STATION_Y }, stand: { x: STATION_X[kind], y: STAND_Y } }));
}

export function stationX(kind: StationKind): number {
  return STATION_X[kind];
}

export function buildTables(count: number): { tables: Table[]; seats: Seat[] } {
  const tables: Table[] = [];
  const seats: Seat[] = [];
  for (let i = 0; i < Math.min(count, TABLE_SLOTS.length); i++) {
    const pos = TABLE_SLOTS[i] as Vec;
    tables.push({ id: i, slot: i, pos });
    SEAT_OFFSETS.forEach((dx) => {
      seats.push({
        id: seats.length,
        table: i,
        pos: { x: pos.x + dx, y: pos.y + SEAT_DY },
        stand: { x: pos.x + dx, y: pos.y + STAND_DY },
        guest: null,
      });
    });
  }
  return { tables, seats };
}

// ─── Walking around the tables ────────────────────────────────────────────

type Rect = { x1: number; y1: number; x2: number; y2: number };

/** Tables plus the guests sitting behind them, padded so Kiki doesn't clip a chair. */
export function obstaclesFor(tables: Table[]): Rect[] {
  return tables.map((t) => ({ x1: t.pos.x - TABLE_W / 2 - 6, y1: t.pos.y - 56, x2: t.pos.x + TABLE_W / 2 + 6, y2: t.pos.y + 24 }));
}

function segmentHitsRect(a: Vec, b: Vec, r: Rect): boolean {
  // Liang–Barsky clip: does the segment enter the rectangle's interior?
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - r.x1],
    [dx, r.x2 - a.x],
    [-dy, a.y - r.y1],
    [dy, r.y2 - a.y],
  ];
  for (const [pp, q] of checks) {
    if (pp === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / pp;
      if (pp < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-6;
}

function clear(a: Vec, b: Vec, rects: Rect[]): boolean {
  for (const r of rects) if (segmentHitsRect(a, b, r)) return false;
  return true;
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Shortest walk from `from` to `to` that goes around tables: a visibility
 * graph over the padded table corners, solved with Dijkstra. Six tables means
 * at most 26 nodes, so this is instant.
 */
export function findPath(from: Vec, to: Vec, rects: Rect[]): Vec[] {
  if (clear(from, to, rects)) return [to];
  const nodes: Vec[] = [from, to];
  const pad = 1.5;
  for (const r of rects) {
    nodes.push(
      { x: r.x1 - pad, y: r.y1 - pad },
      { x: r.x2 + pad, y: r.y1 - pad },
      { x: r.x1 - pad, y: r.y2 + pad },
      { x: r.x2 + pad, y: r.y2 + pad },
    );
  }
  const n = nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[0] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || (best[i] as number) < (best[u] as number))) u = i;
    if (u === -1 || best[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    const nu = nodes[u] as Vec;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const nv = nodes[v] as Vec;
      if (!clear(nu, nv, rects)) continue;
      const d = (best[u] as number) + dist(nu, nv);
      if (d < (best[v] as number)) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[1] === -1) return [to];
  const path: Vec[] = [];
  for (let at = 1; at !== 0 && at !== -1; at = prev[at] as number) path.unshift(nodes[at] as Vec);
  return path;
}
