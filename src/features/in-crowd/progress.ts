import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { LEVELS } from './engine/levels';
import { NO_UPGRADES, UPGRADES } from './engine/upgrades';
import type { TipId, UpgradeId, Upgrades } from './engine/types';

/**
 * The In Crowd save data. It lives on the phone only (AsyncStorage): stars,
 * best scores, coins, upgrades, Kiki's follower count and which tips and
 * story scenes you've already seen.
 */
export type LevelRecord = { stars: number; best: number; plays: number };

export type Progress = {
  v: 1;
  levels: Record<string, LevelRecord>;
  coins: number;
  /** Kiki's own follower count; grows every night. */
  followers: number;
  upgrades: Upgrades;
  seenStory: number[];
  seenOutro: number[];
  seenTips: TipId[];
  haptics: boolean;
  totals: { served: number; unfollows: number; bestStreak: number; nights: number; lives: number };
};

const KEY = 'incrowd:v1';

const DEFAULT: Progress = {
  v: 1,
  levels: {},
  coins: 0,
  followers: 12_000,
  upgrades: NO_UPGRADES,
  seenStory: [],
  seenOutro: [],
  seenTips: [],
  haptics: true,
  totals: { served: 0, unfollows: 0, bestStreak: 0, nights: 0, lives: 0 },
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

export function markStory(chapter: number) {
  const p = snapshot.progress;
  if (!p.seenStory.includes(chapter)) set({ ...p, seenStory: [...p.seenStory, chapter] });
}

export function markOutro(chapter: number) {
  const p = snapshot.progress;
  if (!p.seenOutro.includes(chapter)) set({ ...p, seenOutro: [...p.seenOutro, chapter] });
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
