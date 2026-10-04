/** Small seeded random generator (mulberry32), so a level plays the same way for the same seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** Picks a key with probability proportional to its weight. */
export function weighted<K extends string>(rng: () => number, weights: Partial<Record<K, number>>): K | null {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k] ?? 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k in weights) {
    r -= Math.max(0, weights[k] ?? 0);
    if (r <= 0) return k;
  }
  return null;
}
