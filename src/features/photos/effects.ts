/**
 * Effects: looks drawn over a photo or video, on top of any color filter.
 * Each is a few gradient layers in 0–1 coordinates, so the same numbers are
 * baked into photos (Skia on phones, canvas on the web) and drawn over
 * videos while they play (SVG). A video can't have its colors changed on the
 * phone without the App Store build, so videos get effects, not filters.
 */
export type EffectKey = 'none' | 'vignette' | 'glow' | 'leak' | 'dream' | 'film';

type Stop = [offset: number, color: string];
export type Layer =
  | { type: 'radial'; cx: number; cy: number; r: number; stops: Stop[] }
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }
  | { type: 'frame'; width: number; color: string };

const T = 'rgba(0,0,0,0)';

export const EFFECTS: { key: EffectKey; label: string; layers: Layer[] }[] = [
  { key: 'none', label: 'No effect', layers: [] },
  {
    key: 'vignette',
    label: 'Vignette',
    layers: [{ type: 'radial', cx: 0.5, cy: 0.5, r: 0.75, stops: [[0.45, T], [1, 'rgba(0,0,0,0.6)']] }],
  },
  {
    key: 'glow',
    label: 'Golden hour',
    layers: [
      { type: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [[0, 'rgba(255,170,80,0.28)'], [0.7, 'rgba(255,170,80,0)']] },
      { type: 'radial', cx: 0.5, cy: 0.35, r: 0.6, stops: [[0, 'rgba(255,225,180,0.16)'], [1, 'rgba(255,225,180,0)']] },
    ],
  },
  {
    key: 'leak',
    label: 'Light leak',
    layers: [
      { type: 'linear', x1: 0, y1: 0, x2: 0.7, y2: 0.6, stops: [[0, 'rgba(255,80,40,0.42)'], [0.6, 'rgba(255,80,40,0)']] },
      { type: 'radial', cx: 1, cy: 0.1, r: 0.55, stops: [[0, 'rgba(255,205,90,0.35)'], [1, 'rgba(255,205,90,0)']] },
    ],
  },
  {
    key: 'dream',
    label: 'Dreamy',
    layers: [
      { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, 'rgba(255,190,230,0.18)'], [1, 'rgba(170,200,255,0.18)']] },
      { type: 'radial', cx: 0.5, cy: 0.5, r: 0.7, stops: [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']] },
    ],
  },
  {
    key: 'film',
    label: 'Film',
    layers: [
      { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [[0, 'rgba(255,230,190,0.1)'], [1, 'rgba(255,230,190,0.1)']] },
      { type: 'radial', cx: 0.5, cy: 0.5, r: 0.8, stops: [[0.55, T], [1, 'rgba(0,0,0,0.4)']] },
      { type: 'frame', width: 0.035, color: 'rgba(12,12,12,1)' },
    ],
  },
];

export const effectLayers = (key: EffectKey | null | undefined) => EFFECTS.find((e) => e.key === key)?.layers ?? [];
export const isEffect = (v: unknown): v is EffectKey => EFFECTS.some((e) => e.key === v);
