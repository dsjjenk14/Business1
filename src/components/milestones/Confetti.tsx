import { useEffect, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/** Falling confetti in the given colors. Render nothing when Reduce Motion is on. */
export function Confetti({ count, colors, duration = 2600 }: { count: number; colors: string[]; duration?: number }) {
  const { width, height } = useWindowDimensions();
  // Pieces are placed from a fixed seed so they don't jump between renders.
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
        return {
          x: r(1) * width,
          drift: (r(2) - 0.5) * 120,
          delay: r(3) * 600,
          size: 6 + r(4) * 8,
          spin: (r(5) - 0.5) * 900,
          color: colors[i % colors.length]!,
          round: r(6) > 0.6,
        };
      }),
    [count, colors, width],
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} fall={height + 40} duration={duration} />
      ))}
    </View>
  );
}

function Piece({ x, drift, delay, size, spin, color, round, fall, duration }: { x: number; drift: number; delay: number; size: number; spin: number; color: string; round: boolean; fall: number; duration: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) })));
  }, [p, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: p.get() < 0.9 ? 1 : (1 - p.get()) * 10,
    transform: [{ translateY: -30 + p.get() * fall }, { translateX: p.get() * drift }, { rotate: `${p.get() * spin}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: size, height: round ? size : size * 0.45, borderRadius: round ? size / 2 : 2, backgroundColor: color }, style]} />;
}
