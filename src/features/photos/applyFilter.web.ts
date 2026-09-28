import { filterMatrix, MAX_SIDE, type FilterKey } from './filters';

/** Web: same color matrix as on phones, applied pixel by pixel on a canvas. */
export async function applyFilter(uri: string, key: FilterKey, maxSide = MAX_SIDE): Promise<string> {
  if (key === 'none') return uri;
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
  const m = filterMatrix(key);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, a = d[i + 3]!;
    for (let row = 0; row < 3; row++) {
      const o = row * 5;
      d[i + row] = m[o]! * r + m[o + 1]! * g + m[o + 2]! * b + m[o + 3]! * a + m[o + 4]! * 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.88);
}
