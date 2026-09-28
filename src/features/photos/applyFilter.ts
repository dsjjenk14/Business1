import { ImageFormat, Skia } from '@shopify/react-native-skia';

import { filterMatrix, MAX_SIDE, type FilterKey } from './filters';

/**
 * Phones: draw the photo through the filter with Skia and return it as a
 * JPEG data URI (shown right away, uploaded as is). Web: applyFilter.web.ts.
 */
export async function applyFilter(uri: string, key: FilterKey, maxSide = MAX_SIDE): Promise<string> {
  if (key === 'none') return uri;
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Couldn’t open that photo.');
  const scale = Math.min(1, maxSide / Math.max(image.width(), image.height()));
  const w = Math.round(image.width() * scale);
  const h = Math.round(image.height() * scale);
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) throw new Error('Couldn’t apply the filter.');
  const paint = Skia.Paint();
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(filterMatrix(key)));
  surface.getCanvas().drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, w, h), paint);
  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 88);
  return `data:image/jpeg;base64,${base64}`;
}
