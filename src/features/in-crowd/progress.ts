import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { CLOSET_BY_ID, DEFAULT_EQUIPPED, FREE_ITEMS, dressedLook, type Equipped, type Slot } from './closet';
import { PLANNERS, type PlannerId } from './engine/content';
import { LEVELS } from './engine/levels';
import type { Look, TipId, UpgradeId, Upgrades } from './engine/types';
import { NO_UPGRADES, UPGRADES } from './engine/upgrades';
import { PACKS_BY_ID, PASS_COIN_PRICE, type PackId } from './packs';

/**
 * The In Crowd save data. It lives on the phone only (AsyncStorage): stars,
 * best scores, coins, upgrades, VIP Passes, the planner and her Closet, the
 * planner's follower count and which tips and story scenes you've seen.
 */
export type LevelRecord = { stars: number; best: number; plays: number };

export type Progress = {
  v: 1;
  levels: Record<string, LevelRecord>;
  coins: number;
  /** The planner's own follower count; grows every night. */
  followers: number;
  upgrades: Upgrades;
  /** Story scenes already shown ("1-3:before"). */
  seenScenes: string[];
  seenTips: TipId[];
  haptics: boolean;
  totals: { served: number; unfollows: number; bestStreak: number; nights: number; lives: number };
  planner: PlannerId;
  closet: { owned: string[]; equipped: Record<PlannerId, Equipped> };
  /** VIP Passes: one is used for each night you don't pass. */
  passes: number;
  /** When the current 20-minute refill started (ms). */
  passAnchor: number;
  /** Store transactions already granted, so a pack is never added twice. */
  grantedTx: string[];
};

export const MAX_PASSES = 3;
export const PASS_REFILL_MS = 20 * 60 * 1000;

const KEY = 'incrowd:v1';

const DEFAULT: Progress = {
  v: 1,
  levels: {},
  coins: 0,
  followers: 12_000,
  upgrades: NO_UPGRADES,
  seenScenes: [],
  seenTips: [],
  haptics: true,
  totals: { served: 0, unfollows: 0, bestStreak: 0, nights: 0, lives: 0 },
  planner: 'zara',
  closet: { owned: FREE_ITEMS, equipped: DEFAULT_EQUIPPED },
  passes: MAX_PASSES,
  passAnchor: 0,
  grantedTx: [],
};

type Snapshot = { progress: Progress; loaded: boolean };

let snapshot: Snapshot = { progress: DEFAULT, loaded: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(progress: Progress) {
  snapshot = { progress, loaded: true };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(progress)).catch(() => undefined);
}

function migrate(raw: unknown): Progress {
  const p = (raw ?? {}) as Partial<Progress>;
  return {
    ...DEFAULT,
    ...p,
    v: 1,
    upgrades: { ...NO_UPGRADES, ...(p.upgrades ?? {}) },
    totals: { ...DEFAULT.totals, ...(p.totals ?? {}) },
    levels: p.levels ?? {},
    closet: {
      owned: [...new Set([...FREE_ITEMS, ...(p.closet?.owned ?? [])])],
      equipped: { ...DEFAULT_EQUIPPED, ...(p.closet?.equipped ?? {}) },
    },
    planner: p.planner && p.planner in PLANNERS ? p.planner : 'zara',
  };
}

export function loadProgress(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        snapshot = { progress: raw ? migrate(JSON.parse(raw)) : DEFAULT, loaded: true };
      })
      .catch(() => {
        snapshot = { progress: DEFAULT, loaded: true };
      })
      .finally(() => listeners.forEach((l) => l()));
  }
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProgress(): Snapshot {
  useEffect(() => {
    loadProgress();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

export function getProgress(): Progress {
  return snapshot.progress;
}

// ─── Questions ────────────────────────────────────────────────────────────

export function isUnlocked(p: Progress, levelId: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  if (i <= 0) return i === 0;
  const prev = LEVELS[i - 1];
  return !!prev && (p.levels[prev.id]?.stars ?? 0) >= 1;
}

export function chapterUnlocked(p: Progress, chapter: number): boolean {
  const first = LEVELS.find((l) => l.chapter === chapter);
  return !!first && isUnlocked(p, first.id);
}

export function totalStars(p: Progress): number {
  return Object.values(p.levels).reduce((s, l) => s + l.stars, 0);
}

export function chapterStars(p: Progress, chapter: number): number {
  return LEVELS.filter((l) => l.chapter === chapter).reduce((s, l) => s + (p.levels[l.id]?.stars ?? 0), 0);
}

/** The next level to play: the first one without a star, or the last one. */
export function currentLevelId(p: Progress): string {
  return (LEVELS.find((l) => (p.levels[l.id]?.stars ?? 0) === 0 && isUnlocked(p, l.id)) ?? LEVELS[LEVELS.length - 1])?.id ?? '1-1';
}

// ─── Changes ──────────────────────────────────────────────────────────────

export type NightResult = { newBest: boolean; firstClear: boolean; coins: number; followers: number };

export function recordNight(
  levelId: string,
  result: { score: number; stars: number; coins: number; followers: number; served: number; unfollows: number; bestStreak: number; lives: number },
): NightResult {
  const p = snapshot.progress;
  const before = p.levels[levelId] ?? { stars: 0, best: 0, plays: 0 };
  const next: LevelRecord = { stars: Math.max(before.stars, result.stars), best: Math.max(before.best, result.score), plays: before.plays + 1 };
  set({
    ...p,
    levels: { ...p.levels, [levelId]: next },
    coins: p.coins + result.coins,
    followers: p.followers + result.followers,
    totals: {
      served: p.totals.served + result.served,
      unfollows: p.totals.unfollows + result.unfollows,
      bestStreak: Math.max(p.totals.bestStreak, result.bestStreak),
      nights: p.totals.nights + 1,
      lives: p.totals.lives + result.lives,
    },
  });
  return { newBest: result.score > before.best, firstClear: before.stars === 0 && result.stars > 0, coins: result.coins, followers: result.followers };
}

export function upgradePrice(p: Progress, id: UpgradeId): number | null {
  const tier = UPGRADES[id].tiers[p.upgrades[id]];
  return tier ? tier.price : null;
}

export function buyUpgrade(id: UpgradeId): boolean {
  const p = snapshot.progress;
  const price = upgradePrice(p, id);
  if (price === null || p.coins < price) return false;
  set({ ...p, coins: p.coins - price, upgrades: { ...p.upgrades, [id]: p.upgrades[id] + 1 } });
  return true;
}

export function markScene(key: string) {
  const p = snapshot.progress;
  if (!p.seenScenes.includes(key)) set({ ...p, seenScenes: [...p.seenScenes, key] });
}

// ─── The planner and her Closet ───────────────────────────────────────────

export function plannerProfile(p: Progress) {
  return PLANNERS[p.planner];
}

export function plannerFirstName(p: Progress): string {
  return PLANNERS[p.planner].name.split(' ')[0] ?? 'Zara';
}

/** The planner's look with everything she has on from the Closet. */
export function plannerLook(p: Progress, planner: PlannerId = p.planner): Look {
  return dressedLook(planner, p.closet.equipped[planner] ?? {});
}

export function setPlanner(planner: PlannerId) {
  set({ ...snapshot.progress, planner });
}

export function buyClosetItem(id: string): boolean {
  const p = snapshot.progress;
  const item = CLOSET_BY_ID[id];
  if (!item || p.closet.owned.includes(id) || p.coins < item.price) return false;
  set({ ...p, coins: p.coins - item.price, closet: { ...p.closet, owned: [...p.closet.owned, id] } });
  return true;
}

/** Puts an owned item on the current planner (or takes that slot off with null). */
export function equip(slot: Slot, id: string | null) {
  const p = snapshot.progress;
  if (id && !p.closet.owned.includes(id)) return;
  const mine = { ...(p.closet.equipped[p.planner] ?? {}) };
  if (id) mine[slot] = id;
  else delete mine[slot];
  set({ ...p, closet: { ...p.closet, equipped: { ...p.closet.equipped, [p.planner]: mine } } });
}

// ─── VIP Passes ───────────────────────────────────────────────────────────

/** Passes right now, counting refills since the last save. Bought passes can stack above 3. */
export function passesAt(p: Progress, now = Date.now()): { passes: number; anchor: number; nextIn: number } {
  if (p.passes >= MAX_PASSES) return { passes: p.passes, anchor: now, nextIn: 0 };
  const gained = Math.max(0, Math.floor((now - p.passAnchor) / PASS_REFILL_MS));
  const passes = Math.min(MAX_PASSES, p.passes + gained);
  const anchor = passes >= MAX_PASSES ? now : p.passAnchor + gained * PASS_REFILL_MS;
  return { passes, anchor, nextIn: passes >= MAX_PASSES ? 0 : Math.max(0, anchor + PASS_REFILL_MS - now) };
}

function withPasses(p: Progress, change: number, now = Date.now()): Progress {
  const cur = passesAt(p, now);
  const passes = Math.max(0, cur.passes + change);
  // Dropping below the cap starts the 20-minute clock.
  const anchor = cur.passes >= MAX_PASSES && passes < MAX_PASSES ? now : cur.anchor;
  return { ...p, passes, passAnchor: anchor };
}

/** Uses a pass when a night starts. Returns false if there are none. */
export function takePass(): boolean {
  const p = snapshot.progress;
  if (passesAt(p).passes <= 0) return false;
  set(withPasses(p, -1));
  return true;
}

/** Gives the pass back after a night you passed. */
export function returnPass() {
  set(withPasses(snapshot.progress, +1));
}

export function buyPassWithCoins(): boolean {
  const p = snapshot.progress;
  if (p.coins < PASS_COIN_PRICE) return false;
  set(withPasses({ ...p, coins: p.coins - PASS_COIN_PRICE }, +1));
  return true;
}

/** Adds what a store purchase bought, once per transaction. */
export function grantPack(id: PackId, transactionId: string): boolean {
  const p = snapshot.progress;
  if (p.grantedTx.includes(transactionId)) return false;
  const pack = PACKS_BY_ID[id];
  const tx = [...p.grantedTx, transactionId].slice(-100);
  if (pack.kind === 'coins') set({ ...p, coins: p.coins + pack.amount, grantedTx: tx });
  else set({ ...withPasses(p, pack.amount), grantedTx: tx });
  return true;
}

export function markTips(tips: TipId[]) {
  const p = snapshot.progress;
  const add = tips.filter((t) => !p.seenTips.includes(t));
  if (add.length) set({ ...p, seenTips: [...p.seenTips, ...add] });
}

export function setHaptics(on: boolean) {
  set({ ...snapshot.progress, haptics: on });
}

export function resetProgress() {
  set(DEFAULT);
}
