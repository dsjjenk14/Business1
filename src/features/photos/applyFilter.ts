import { BlendMode, ImageFormat, Skia, TileMode, type SkCanvas, type SkSurface } from '@shopify/react-native-skia';

import { effectLayers, type EffectKey } from './effects';

import { filterSpec, MAX_SIDE, type FilterKey } from './filters';

/**
 * Phones: draw the photo through the filter, then the effect, with Skia and
 * return it as a JPEG data URI (shown right away, uploaded as is).
 * Web: applyFilter.web.ts.
 */
export async function applyFilter(uri: string, key: FilterKey, maxSide = MAX_SIDE, effect: EffectKey = 'none'): Promise<string> {
  if (key === 'none' && effect === 'none') return uri;
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Couldn’t open that photo.');
  const scale = Math.min(1, maxSide / Math.max(image.width(), image.height()));
  const w = Math.round(image.width() * scale);
  const h = Math.round(image.height() * scale);
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) throw new Error('Couldn’t apply the filter.');
  const spec = filterSpec(key);
  const paint = Skia.Paint();
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(spec.matrix));
  surface.getCanvas().drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, w, h), paint);
  beautify(surface, spec.soften, spec.glow, w, h);
  drawEffect(surface.getCanvas(), effect, w, h);
  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 88);
  return `data:image/jpeg;base64,${base64}`;
}

/** Smooth skin (a blurred copy laid over) and add a soft glow (a blurred copy lightening highlights). */
function beautify(surface: SkSurface, soften: number, glow: number, w: number, h: number) {
  if (!soften && !glow) return;
  const big = Math.max(w, h);
  const canvas = surface.getCanvas();
  surface.flush();
  const base = surface.makeImageSnapshot();
  const layer = (sigma: number, alpha: number, mode: BlendMode) => {
    const p = Skia.Paint();
    p.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    p.setAlphaf(alpha);
    p.setBlendMode(mode);
    canvas.drawImage(base, 0, 0, p);
  };
  if (soften) layer(big * 0.004, soften * 0.8, BlendMode.SrcOver);
  if (glow) layer(big * 0.02, glow * 0.6, BlendMode.Screen);
}

function drawEffect(canvas: SkCanvas, effect: EffectKey, w: number, h: number) {
  const big = Math.max(w, h);
  for (const layer of effectLayers(effect)) {
    const paint = Skia.Paint();
    if (layer.type === 'frame') {
      const b = layer.width * Math.min(w, h);
      paint.setColor(Skia.Color(layer.color));
      for (const r of [Skia.XYWHRect(0, 0, w, b), Skia.XYWHRect(0, h - b, w, b), Skia.XYWHRect(0, 0, b, h), Skia.XYWHRect(w - b, 0, b, h)]) canvas.drawRect(r, paint);
      continue;
    }
    const colors = layer.stops.map(([, c]) => Skia.Color(c));
    const pos = layer.stops.map(([o]) => o);
    paint.setShader(
      layer.type === 'radial'
        ? Skia.Shader.MakeRadialGradient({ x: layer.cx * w, y: layer.cy * h }, layer.r * big, colors, pos, TileMode.Clamp)
        : Skia.Shader.MakeLinearGradient({ x: layer.x1 * w, y: layer.y1 * h }, { x: layer.x2 * w, y: layer.y2 * h }, colors, pos, TileMode.Clamp),
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }
}
