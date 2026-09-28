import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Plays frames forward, then backward, on a loop: a boomerang. */
export function BoomerangPlayer({ frames, fps = 12, rounded = true }: { frames: string[]; fps?: number; rounded?: boolean }) {
  const t = useTheme();
  const [i, setI] = useState(0);

  useEffect(() => {
    frames.forEach((f) => Image.prefetch(f).catch(() => undefined));
  }, [frames]);

  useEffect(() => {
    if (frames.length < 2) return;
    // 0,1,…,n-1,n-2,…,1, then again.
    const cycle = frames.length * 2 - 2;
    let step = 0;
    const timer = setInterval(() => {
      step = (step + 1) % cycle;
      setI(step < frames.length ? step : cycle - step);
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [frames, fps]);

  const src = frames[i] ?? frames[0];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Boomerang"
      style={{ aspectRatio: 4 / 5, width: '100%', overflow: 'hidden', borderRadius: rounded ? t.radius.md : 0, backgroundColor: t.colors.surfaceAlt }}>
      {src ? <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={0} /> : null}
      <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
          BOOMERANG
        </AppText>
      </View>
    </View>
  );
}
