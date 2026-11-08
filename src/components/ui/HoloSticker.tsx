import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { fitSticker, STICKER_SIZE } from './Badge';
import { Glyph, type GlyphName } from './Glyph';

/**
 * A holographic foil sticker in the app's own red and gold, with a silver shine,
 * for special badges: Background checked, Identity confirmed, big vouch
 * milestones. A light sheen sweeps across it now and then (not with Reduce Motion).
 */
export function HoloSticker({ label, sub, glyph, size = STICKER_SIZE }: { label: string; sub?: string; glyph?: GlyphName; size?: number }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const sweep = useSharedValue(-1);

  useEffect(() => {
    if (reduce) return;
    sweep.set(withRepeat(withDelay(2200, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1, false));
  }, [reduce, sweep]);

  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.get() * size * 1.4 }, { rotate: '25deg' }] }));
  const ink = '#0C0C0C';
  const id = `holo-${label.replace(/\W/g, '')}`;
  const { text, lines, size: fontSize } = fitSticker(label, size);
  // No room for the symbol when the words take three lines.
  const showGlyph = !!glyph && lines < 3;

  return (
    <View
      accessible
      accessibilityLabel={sub ? `${label} ${sub}` : label}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2.5, borderColor: '#F5F5F5' }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={`${id}-foil`} x1="0" y1="0" x2="1" y2="1">
            {/* Your colors only: red and gold foil with a silver shine. */}
            <Stop offset="0" stopColor={t.colors.primary} />
            <Stop offset="0.35" stopColor={t.colors.secondary} />
            <Stop offset="0.5" stopColor="#F5F5F5" />
            <Stop offset="0.65" stopColor={t.colors.secondary} />
            <Stop offset="1" stopColor={t.colors.primary} />
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="0.5" cy="0.45" r="0.5">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id}-foil)`} />
        <Circle cx="50" cy="50" r="50" fill={`url(#${id}-glow)`} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: -size * 0.25, left: size * 0.3, width: size * 0.22, height: size * 1.5, backgroundColor: 'rgba(255,255,255,0.45)' }, sheen]}
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
