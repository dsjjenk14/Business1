import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { signPhotoPaths, type FeedPin } from '@/features/pins/api';
import { useTheme } from '@/theme';

/** A 3-across grid of someone's photo posts (first photo of each); tap to open the post. */
export function PhotoGrid({ pins }: { pins: FeedPin[] }) {
  const t = useTheme();
  const router = useRouter();
  const withPhotos = pins.filter((p) => p.photo_paths.length > 0);
  const firstPaths = withPhotos.map((p) => p.photo_paths[0] as string);
  const key = firstPaths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (key) signPhotoPaths(key.split('|')).then((u) => !cancelled && setUrls(u));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!withPhotos.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, borderRadius: t.radius.md, overflow: 'hidden' }}>
      {withPhotos.map((p, i) => {
        const path = p.photo_paths[0] as string;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="link"
            accessibilityLabel={`Photo post ${i + 1}: ${p.body.slice(0, 60)}`}
            onPress={() => router.push({ pathname: '/pins/[id]', params: { id: String(p.id) } })}
            style={{ width: '32.6%', aspectRatio: 1, backgroundColor: t.colors.surfaceAlt }}>
            {urls[path] ? <Image source={{ uri: urls[path] }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
