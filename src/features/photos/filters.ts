/**
 * Photo filters as 4×5 color matrices (RGBA rows; the 5th column is an
 * offset in 0–1). The same numbers are used on phones (Skia) and on the web
 * (canvas), so a filter looks the same everywhere. The filter is baked into
 * the photo before upload.
 */
export type FilterKey = 'none' | 'warm' | 'cool' | 'vivid' | 'fade' | 'vintage' | 'mono' | 'noir';
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

export const filterMatrix = (key: FilterKey) => (FILTERS.find((f) => f.key === key) ?? FILTERS[0]!).matrix;

/** Longest side of a baked photo, in pixels. */
export const MAX_SIDE = 2048;
