/**
 * Photo filters as 4×5 color matrices (RGBA rows; the 5th column is an
 * offset in 0–1). The same numbers are used on phones (Skia) and on the web
 * (canvas), so a filter looks the same everywhere. The filter is baked into
 * the photo before upload.
 */
export type FilterKey = 'none' | 'warm' | 'cool' | 'vivid' | 'fade' | 'vintage' | 'mono' | 'noir' | OutFilterKey;
type M = number[]; // 20 numbers

const IDENTITY: M = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** a ∘ b: apply b, then a. */
function multiply(a: M, b: M): M {
  const out: M = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4]! : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k]! * b[k * 5 + c]!;
      out[r * 5 + c] = v;
    }
  }
  return out;
}
const chain = (...ms: M[]) => ms.reduce((acc, m) => multiply(m, acc), IDENTITY);

function saturation(s: number): M {
  const [lr, lg, lb] = [0.2126, 0.7152, 0.0722];
  const i = 1 - s;
  return [lr * i + s, lg * i, lb * i, 0, 0, lr * i, lg * i + s, lb * i, 0, 0, lr * i, lg * i, lb * i + s, 0, 0, 0, 0, 0, 1, 0];
}
function contrast(c: number): M {
  const o = (1 - c) / 2;
  return [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0];
}
function brightness(b: number): M {
  return [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
}
function tint(r: number, g: number, b: number): M {
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}
const SEPIA: M = [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0];

export const FILTERS: { key: FilterKey; label: string; matrix: M }[] = [
  { key: 'none', label: 'Original', matrix: IDENTITY },
  { key: 'warm', label: 'Golden', matrix: chain(tint(1.08, 1.02, 0.88), saturation(1.1), brightness(0.02)) },
  { key: 'cool', label: 'Cool', matrix: chain(tint(0.92, 1.0, 1.1), saturation(0.95)) },
  { key: 'vivid', label: 'Vivid', matrix: chain(saturation(1.45), contrast(1.1)) },
  { key: 'fade', label: 'Fade', matrix: chain(contrast(0.82), saturation(0.8), brightness(0.04)) },
  { key: 'vintage', label: 'Vintage', matrix: chain(SEPIA, contrast(0.9), brightness(0.03)) },
  { key: 'mono', label: 'B&W', matrix: saturation(0) },
  { key: 'noir', label: 'Noir', matrix: chain(saturation(0), contrast(1.45)) },
];

/**
 * Out filters: 24 of I'm In's own, 8 at a time. A new set of 8 comes every
 * 3 days, so there's always something new. Beyond color, the flattering ones
 * smooth skin (`soften`: a blurred copy laid over the photo) and add a soft
 * glow (`glow`: a blurred copy lightening the highlights), 0–1.
 */
export type OutFilterKey =
  | 'glow_up' | 'honey' | 'velvet' | 'rooftop' | 'porcelain' | 'last_call' | 'bronze' | 'neon'
  | 'soft_focus' | 'peach' | 'dewy' | 'candlelight' | 'espresso' | 'afterglow' | 'rose' | 'blue_hour'
  | 'flawless' | 'sunkissed' | 'satin' | 'champagne' | 'midnight' | 'blush' | 'noir_night' | 'gold_rush';
export type OutFilter = { key: OutFilterKey; label: string; matrix: M; soften?: number; glow?: number };

export const OUT_FILTERS: OutFilter[] = [
  // Set 1
  { key: 'glow_up', label: 'Glow Up', matrix: chain(tint(1.04, 1.01, 0.97), saturation(1.05), brightness(0.04)), soften: 0.4, glow: 0.3 },
  { key: 'honey', label: 'Honey', matrix: chain(tint(1.1, 1.03, 0.84), saturation(1.08), brightness(0.03)), soften: 0.2 },
  { key: 'velvet', label: 'Velvet', matrix: chain(tint(1.03, 0.98, 1.0), saturation(0.9), contrast(0.95)), soften: 0.5 },
  { key: 'rooftop', label: 'Rooftop', matrix: chain(tint(1.1, 1.0, 0.86), saturation(1.15), contrast(1.1)), glow: 0.2 },
  { key: 'porcelain', label: 'Porcelain', matrix: chain(tint(0.98, 1.0, 1.04), saturation(0.85), brightness(0.07)), soften: 0.45 },
  { key: 'last_call', label: 'Last Call', matrix: chain(tint(1.06, 0.97, 0.92), saturation(0.8), contrast(1.2), brightness(-0.03)) },
  { key: 'bronze', label: 'Bronze', matrix: chain(tint(1.12, 1.0, 0.8), saturation(1.12), contrast(1.06)), soften: 0.2, glow: 0.15 },
  { key: 'neon', label: 'Neon Night', matrix: chain(tint(1.08, 0.9, 1.12), saturation(1.35), contrast(1.12)), glow: 0.35 },
  // Set 2
  { key: 'soft_focus', label: 'Soft Focus', matrix: chain(saturation(0.95), brightness(0.03)), soften: 0.55, glow: 0.2 },
  { key: 'peach', label: 'Peach', matrix: chain(tint(1.08, 1.0, 0.92), saturation(1.05), brightness(0.04)), soften: 0.3 },
  { key: 'dewy', label: 'Dewy', matrix: chain(tint(1.0, 1.02, 1.03), saturation(1.02), brightness(0.05)), soften: 0.35, glow: 0.35 },
  { key: 'candlelight', label: 'Candlelight', matrix: chain(tint(1.14, 1.0, 0.78), saturation(1.05), contrast(1.05)), glow: 0.3 },
  { key: 'espresso', label: 'Espresso', matrix: chain(SEPIA, saturation(1.4), contrast(1.15), brightness(-0.02)) },
  { key: 'afterglow', label: 'Afterglow', matrix: chain(tint(1.1, 0.96, 0.95), saturation(1.1), brightness(0.03)), glow: 0.4 },
  { key: 'rose', label: 'Rosé', matrix: chain(tint(1.08, 0.95, 1.0), saturation(1.05), brightness(0.03)), soften: 0.3 },
  { key: 'blue_hour', label: 'Blue Hour', matrix: chain(tint(0.9, 0.98, 1.14), saturation(0.95), contrast(1.08)), glow: 0.15 },
  // Set 3
  { key: 'flawless', label: 'Flawless', matrix: chain(tint(1.03, 1.01, 0.99), saturation(1.02), brightness(0.05)), soften: 0.6, glow: 0.25 },
  { key: 'sunkissed', label: 'Sunkissed', matrix: chain(tint(1.12, 1.04, 0.85), saturation(1.15), brightness(0.03)), soften: 0.25, glow: 0.2 },
  { key: 'satin', label: 'Satin', matrix: chain(tint(1.02, 1.0, 1.0), saturation(0.92), contrast(0.92), brightness(0.03)), soften: 0.45 },
  { key: 'champagne', label: 'Champagne', matrix: chain(tint(1.06, 1.04, 0.9), saturation(0.95), brightness(0.05)), glow: 0.3 },
  { key: 'midnight', label: 'Midnight', matrix: chain(tint(0.92, 0.95, 1.1), saturation(0.85), contrast(1.2), brightness(-0.04)) },
  { key: 'blush', label: 'Blush', matrix: chain(tint(1.07, 0.97, 1.0), saturation(1.02), brightness(0.04)), soften: 0.4, glow: 0.15 },
  { key: 'noir_night', label: 'Noir Night', matrix: chain(saturation(0), contrast(1.3), brightness(0.02)), soften: 0.25 },
  { key: 'gold_rush', label: 'Gold Rush', matrix: chain(tint(1.12, 1.05, 0.78), saturation(1.25), contrast(1.1)), glow: 0.25 },
];

/** Out filters rotate: a new set of 8 every this many days. */
export const OUT_FILTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The 8 Out filters out right now, and how many days until the next 8. */
export function currentOutFilters(now = Date.now()) {
  const day = Math.floor(now / DAY_MS);
  const period = Math.floor(day / OUT_FILTER_DAYS);
  const set = period % (OUT_FILTERS.length / 8);
  return { filters: OUT_FILTERS.slice(set * 8, set * 8 + 8), daysLeft: OUT_FILTER_DAYS - (day % OUT_FILTER_DAYS) };
}

/** Everything a filter does: its colors, plus skin smoothing and glow. */
export function filterSpec(key: FilterKey): { matrix: M; soften: number; glow: number } {
  const out = OUT_FILTERS.find((f) => f.key === key);
  if (out) return { matrix: out.matrix, soften: out.soften ?? 0, glow: out.glow ?? 0 };
  return { matrix: (FILTERS.find((f) => f.key === key) ?? FILTERS[0]!).matrix, soften: 0, glow: 0 };
}

export const filterMatrix = (key: FilterKey) => filterSpec(key).matrix;

/** A filter's color on a warm skin tone, for its swatch. */
export function filterSwatch(key: FilterKey) {
  const m = filterMatrix(key);
  const [r, g, b] = [0.82, 0.6, 0.48];
  const ch = (row: number) => Math.round(255 * Math.min(1, Math.max(0, m[row * 5]! * r + m[row * 5 + 1]! * g + m[row * 5 + 2]! * b + m[row * 5 + 4]!)));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** Longest side of a baked photo, in pixels. */
export const MAX_SIDE = 2048;
