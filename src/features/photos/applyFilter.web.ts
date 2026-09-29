import { effectLayers, type EffectKey } from './effects';
import { filterSpec, MAX_SIDE, type FilterKey } from './filters';

/** Web: same color matrix and effect as on phones, drawn on a canvas. */
export async function applyFilter(uri: string, key: FilterKey, maxSide = MAX_SIDE, effect: EffectKey = 'none'): Promise<string> {
  if (key === 'none' && effect === 'none') return uri;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = uri;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Couldn’t apply the filter.');
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const d = pixels.data;
  const spec = filterSpec(key);
  const m = spec.matrix;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, a = d[i + 3]!;
    for (let row = 0; row < 3; row++) {
      const o = row * 5;
      d[i + row] = m[o]! * r + m[o + 1]! * g + m[o + 2]! * b + m[o + 3]! * a + m[o + 4]! * 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  beautify(canvas, ctx, spec.soften, spec.glow);
  drawEffect(ctx, effect, w, h);
  return canvas.toDataURL('image/jpeg', 0.88);
}

/** Smooth skin (a blurred copy laid over) and add a soft glow (a blurred copy lightening highlights). */
function beautify(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, soften: number, glow: number) {
  if (!soften && !glow) return;
  const big = Math.max(canvas.width, canvas.height);
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  base.getContext('2d')?.drawImage(canvas, 0, 0);
  const layer = (blur: number, alpha: number, mode: GlobalCompositeOperation) => {
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode;
    ctx.drawImage(base, 0, 0);
    ctx.restore();
  };
  if (soften) layer(big * 0.004, soften * 0.8, 'source-over');
  if (glow) layer(big * 0.02, glow * 0.6, 'screen');
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: EffectKey, w: number, h: number) {
  const big = Math.max(w, h);
  for (const layer of effectLayers(effect)) {
    if (layer.type === 'frame') {
      const b = layer.width * Math.min(w, h);
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, 0, w, b);
      ctx.fillRect(0, h - b, w, b);
      ctx.fillRect(0, 0, b, h);
      ctx.fillRect(w - b, 0, b, h);
      continue;
    }
    const g =
      layer.type === 'radial'
        ? ctx.createRadialGradient(layer.cx * w, layer.cy * h, 0, layer.cx * w, layer.cy * h, layer.r * big)
        : ctx.createLinearGradient(layer.x1 * w, layer.y1 * h, layer.x2 * w, layer.y2 * h);
    for (const [o, c] of layer.stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
