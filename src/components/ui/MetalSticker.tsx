import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { fitSticker, STICKER_SIZE } from './Badge';
import { Glyph, type GlyphName } from './Glyph';

// A four-point sparkle, centered on (0, 0), 1 unit across.
const SPARKLE = 'M0 -0.5 L0.12 -0.12 L0.5 0 L0.12 0.12 L0 0.5 L-0.12 0.12 L-0.5 0 L-0.12 -0.12 Z';

/**
 * A shiny metal or gem sticker for vouch milestones: lit from the top like
 * polished metal, a pressed inner ring, and a shine that passes over it now and
 * then (not with Reduce Motion). Diamond also sparkles.
 */
export function MetalSticker({
  label,
  sub,
  glyph,
  size = STICKER_SIZE,
  stops,
  ink,
  sparkle,
}: {
  label: string;
  sub?: string;
  glyph?: GlyphName;
  size?: number;
  /** Metal colors from the top of the sticker to the bottom. */
  stops: string[];
  ink: string;
  /** Diamond: little sparkles on the surface. */
  sparkle?: boolean;
}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const sweep = useSharedValue(-1);
  const twinkle = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    sweep.set(withRepeat(withDelay(2400, withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) })), -1, false));
    if (sparkle) twinkle.set(withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [reduce, sweep, twinkle, sparkle]);

  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.get() * size * 1.4 }, { rotate: '25deg' }] }));
  const twinkleStyle = useAnimatedStyle(() => ({ opacity: twinkle.get() }));
  const id = `metal-${label.replace(/\W/g, '')}`;
  const { text, lines, size: fontSize } = fitSticker(label, size);
  const showGlyph = !!glyph && lines < 3;

  return (
    <View
      accessible
      accessibilityLabel={sub ? `${label} ${sub}` : label}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2.5, borderColor: '#F5F5F5' }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
            {stops.map((c, i) => (
              <Stop key={i} offset={String(i / (stops.length - 1))} stopColor={c} />
            ))}
          </LinearGradient>
          <RadialGradient id={`${id}-shine`} cx="0.35" cy="0.25" r="0.45">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id}-metal)`} />
        <Circle cx="50" cy="50" r="50" fill={`url(#${id}-shine)`} />
        {/* Pressed inner ring: a dark line with a light line just inside it. */}
        <Circle cx="50" cy="50" r="42" fill="none" stroke="#000000" strokeOpacity="0.22" strokeWidth="2" />
        <Circle cx="50" cy="50" r="40" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1.2" />
      </Svg>
      {sparkle ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0 }, twinkleStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            {[
              [24, 26, 16],
              [76, 30, 11],
              [70, 76, 14],
              [28, 72, 9],
            ].map(([x, y, s], i) => (
              <Path key={i} d={SPARKLE} fill="#FFFFFF" transform={`translate(${x} ${y}) scale(${s})`} />
            ))}
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: -size * 0.25, left: size * 0.3, width: size * 0.18, height: size * 1.5, backgroundColor: 'rgba(255,255,255,0.4)' }, sheen]}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 2, gap: 0 }}>
        {showGlyph && glyph ? <Glyph name={glyph} size={size * 0.22} color={ink} strokeWidth={2.4} /> : null}
        <AppText align="center" numberOfLines={3} style={{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize, lineHeight: Math.round(fontSize * 1.1) }}>
          {text}
        </AppText>
        {sub ? <AppText style={{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize: size * 0.14, letterSpacing: 0.3 }}>{sub}</AppText> : null}
      </View>
    </View>
  );
}
