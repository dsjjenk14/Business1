import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { signPhotoPaths } from '@/features/pins/api';
import { useTheme } from '@/theme';

/** Up to 6 photos in a tidy grid. Links are signed because the bucket is private. */
export function PinPhotos({ paths }: { paths: string[] }) {
  const t = useTheme();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');

  useEffect(() => {
    let cancelled = false;
    if (key) signPhotoPaths(key.split('|')).then((u) => !cancelled && setUrls(u));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (paths.length === 0) return null;
  const cols = paths.length === 1 ? 1 : paths.length === 2 || paths.length === 4 ? 2 : 3;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderRadius: t.radius.md, overflow: 'hidden' }}>
      {paths.map((p, i) => (
        <View
          key={p}
          style={{ width: `${100 / cols - (cols > 1 ? 1.5 : 0)}%`, aspectRatio: cols === 1 ? 4 / 3 : 1, backgroundColor: t.colors.surfaceAlt }}>
          {urls[p] ? (
            <Image source={{ uri: urls[p] }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
          ) : null}
        </View>
      ))}
    </View>
  );
}
