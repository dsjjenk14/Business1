import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { fitSticker, STICKER_SIZE } from './Badge';
import { Glyph, type GlyphName } from './Glyph';

/**
 * A holographic foil sticker. The brand foil is black, red and white, with a shine;
 * vouch milestones pass their own metal or gem colors,
 * for special badges: Background checked, Identity confirmed, big vouch
 * milestones. A light sheen sweeps across it now and then (not with Reduce Motion).
 */
export function HoloSticker({
  label,
  sub,
  glyph,
  size = STICKER_SIZE,
  stops,
  ink: inkProp,
}: {
  label: string;
  sub?: string;
  glyph?: GlyphName;
  size?: number;
  /** Foil colors, light to dark and back. Defaults to the brand foil: black, red and white. */
  stops?: string[];
  /** Letter color. Defaults to white with a dark outline, readable on every part of the brand foil. */
  ink?: string;
}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const sweep = useSharedValue(-1);

  useEffect(() => {
    if (reduce) return;
    sweep.set(withRepeat(withDelay(2200, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1, false));
  }, [reduce, sweep]);

  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.get() * size * 1.4 }, { rotate: '25deg' }] }));
  const brand = !stops;
  const foil = stops ?? ['#0C0C0C', '#0C0C0C', t.colors.primary, '#F5F5F5', t.colors.primary, '#0C0C0C', '#0C0C0C'];
  const ink = inkProp ?? (brand ? '#FFFFFF' : '#0C0C0C');
  const outline = brand ? { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } } : null;
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
            {foil.map((c, i) => (
              <Stop key={i} offset={String(i / (foil.length - 1))} stopColor={c} />
            ))}
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="0.5" cy="0.45" r="0.5">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={brand ? '0.15' : '0.6'} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={brand ? '0.08' : '0.25'} />
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
        <AppText align="center" numberOfLines={3} style={[{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize, lineHeight: Math.round(fontSize * 1.1) }, outline]}>
          {text}
        </AppText>
        {sub ? <AppText style={[{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize: size * 0.14, letterSpacing: 0.3 }, outline]}>{sub}</AppText> : null}
      </View>
    </View>
  );
}
