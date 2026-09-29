import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { MOTIONS, motionLabel, type Motion } from '@/features/media/api';
import type { EffectKey } from '@/features/photos/effects';
import { useTheme } from '@/theme';

import { EffectOverlay } from './EffectOverlay';

/**
 * Plays a burst of frames on a loop: boomerang (forward then back), slo-mo
 * (the same, slower), rewind (backward) or loop (forward).
 */
export function BoomerangPlayer({
  frames,
  motion = 'boomerang',
  effect,
  rounded = true,
}: {
  frames: string[];
  motion?: Motion;
  effect?: EffectKey | null;
  rounded?: boolean;
}) {
  const t = useTheme();
  const [i, setI] = useState(0);
  const fps = MOTIONS.find((m) => m.key === motion)?.fps ?? 12;

  useEffect(() => {
    frames.forEach((f) => Image.prefetch(f).catch(() => undefined));
  }, [frames]);

  useEffect(() => {
    const n = frames.length;
    if (n < 2) return;
    const pingPong = motion === 'boomerang' || motion === 'slowmo';
    // Ping-pong: 0,1,…,n-1,n-2,…,1. Rewind: n-1,…,0. Loop: 0,…,n-1.
    const cycle = pingPong ? n * 2 - 2 : n;
    let step = 0;
    const timer = setInterval(() => {
      step = (step + 1) % cycle;
      setI(pingPong ? (step < n ? step : cycle - step) : motion === 'rewind' ? n - 1 - step : step);
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [frames, fps, motion]);

  const src = frames[i] ?? frames[0];
  return (
    <View style={{ aspectRatio: 4 / 5, width: '100%', overflow: 'hidden', borderRadius: rounded ? t.radius.md : 0, backgroundColor: t.colors.surfaceAlt }}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          accessibilityLabel={motionLabel(motion)}
        />
      ) : null}
      <EffectOverlay effect={effect} />
      <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF', textTransform: 'uppercase' }}>
          {motionLabel(motion)}
        </AppText>
      </View>
    </View>
  );
}
