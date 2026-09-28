import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, View, type DimensionValue, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/** A soft pulsing placeholder block (holds still when Reduce Motion is on). */
export function Skeleton({ width = '100%', height = 14, radius, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius ?? t.radius.sm, backgroundColor: t.colors.surfaceAlt, opacity: still ? 0.7 : pulse }, style]}
    />
  );
}

/** Placeholder rows shaped like a list of people or items, while it loads. */
export function LoadingList({ rows = 3, avatar = true }: { rows?: number; avatar?: boolean }) {
  const t = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: t.space[4] }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          {avatar ? <Skeleton width={44} height={44} radius={22} /> : null}
          <View style={{ flex: 1, gap: t.space[2] }}>
            <Skeleton width={i % 2 ? '55%' : '70%'} height={14} />
            <Skeleton width={i % 2 ? '80%' : '45%'} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a detail screen: a big tile, a title, and a few lines. */
export function LoadingDetail() {
  const t = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: t.space[4], alignItems: 'center' }}>
      <Skeleton width={64} height={64} radius={t.radius.lg} />
      <Skeleton width="60%" height={24} />
      <Skeleton width="40%" height={14} />
      <View style={{ alignSelf: 'stretch', gap: t.space[2], marginTop: t.space[2] }}>
        <Skeleton height={48} radius={t.radius.md} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="75%" height={12} />
      </View>
    </View>
  );
}
