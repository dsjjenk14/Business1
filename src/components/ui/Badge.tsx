import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { Glyph, type GlyphName } from './Glyph';
import { look } from './look';

export type BadgeProps = {
  label: string;
  tone?: 'primary' | 'trust' | 'ai' | 'sponsored' | 'neutral';
  glyph?: GlyphName;
  verified?: boolean;
};

/** Tier chips, profile badges, founding-member tags. Shape follows theme.style.badge. */
export function Badge({ label, tone = 'primary', glyph, verified }: BadgeProps) {
  const t = useTheme();
  const color = tone === 'neutral' ? t.colors.textMuted : tone === 'primary' ? t.colors.primaryText : t.colors[tone];

  if (t.style.badge === 'sticker') {
    // Round sticker: a solid circle with a white edge, chunky rounded letters.
    const fill = tone === 'neutral' ? t.colors.surfaceAlt : tone === 'primary' ? t.colors.primary : t.colors[tone];
    const ink =
      tone === 'neutral'
        ? t.colors.text
        : tone === 'primary'
          ? t.colors.onPrimary
          : tone === 'trust'
            ? t.colors.onTrust
            : tone === 'ai'
              ? t.colors.onAi
              : t.colors.onSponsored;
    return <StickerCircle label={label} fill={fill} ink={ink} glyph={glyph} slap />;
  }

  if (t.style.badge === 'words') {
    // Just words: a small colored dot and the label, no box around it.
    return (
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone === 'neutral' ? t.colors.textSubtle : color }} />
        <AppText variant="small" weight="bold" style={{ color: tone === 'neutral' ? t.colors.text : color }}>
          {label}
        </AppText>
      </View>
    );
  }

  if (t.style.badge === 'credential') {
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: t.borderWidth.regular,
          borderColor: color,
          borderRadius: t.radius.sm,
          paddingHorizontal: t.space[2],
          paddingVertical: 3,
        }}>
        <Ionicons name={verified ? 'shield-checkmark' : 'ribbon-outline'} size={12} color={color} />
        <AppText variant="caption" style={{ color, ...fontStyle(t.fonts.mono), textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </AppText>
      </View>
    );
  }

  if (look(t).ticket) {
    // A small outlined tag.
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderWidth: t.borderWidth.regular,
          borderColor: color,
          borderRadius: t.radius.pill,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}>
        {glyph ? <Glyph name={glyph} size={12} color={color} strokeWidth={2.2} /> : null}
        <AppText style={{ color, ...fontStyle(t.fonts.bodyBold), fontSize: 12, lineHeight: 16 }}>{label}</AppText>
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: t.borderWidth.hairline,
        borderColor: color,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space[3],
        paddingVertical: 3,
      }}>
      {glyph ? <Glyph name={glyph} size={13} color={color} strokeWidth={2} /> : null}
      <AppText variant="caption" weight="bold" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * A round sticker: a solid circle with an edge, chunky rounded letters, and a
 * little tilt that's the same every time for the same word.
 */
export function StickerCircle({
  label,
  fill,
  ink,
  edge,
  glyph,
  slap,
}: {
  label: string;
  fill: string;
  ink: string;
  /** Defaults to a white edge. */
  edge?: string;
  glyph?: GlyphName;
  /** Lands like a sticker being slapped on when it first shows. */
  slap?: boolean;
}) {
  const t = useTheme();
  const { text, size, lines } = fitSticker(label, STICKER_SIZE);
  const tilt = ((label.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % 13) - 6) * 1.2;
  const circle = (
    <View
      style={{
        width: STICKER_SIZE,
        height: STICKER_SIZE,
        borderRadius: STICKER_SIZE / 2,
        backgroundColor: fill,
        borderWidth: 2.5,
        borderColor: edge ?? (t.mode === 'dark' ? '#F5F5F5' : '#FFFFFF'),
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        gap: 0,
        transform: [{ rotate: `${tilt}deg` }],
      }}>
      {glyph && lines < 3 ? <Glyph name={glyph} size={10} color={ink} strokeWidth={2.4} /> : null}
      <AppText
        align="center"
        numberOfLines={3}
        style={{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize: size, lineHeight: Math.round(size * 1.12) }}>
        {text}
      </AppText>
    </View>
  );
  // A fixed-size box keeps the layout steady while the sticker animates in.
  return slap ? (
    <View style={{ width: STICKER_SIZE, height: STICKER_SIZE }}>
      <Animated.View entering={SLAP}>{circle}</Animated.View>
    </View>
  ) : (
    circle
  );
}

/** Big and faded, then pressed flat: a sticker landing. Skipped when Reduce Motion is on. */
const SLAP = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.7 }] },
  55: { opacity: 1, transform: [{ scale: 0.9 }], easing: Easing.out(Easing.quad) },
  80: { transform: [{ scale: 1.05 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(420);

/** A round sticker you tap to pick or unpick (e.g. interests in Edit profile). */
export function StickerToggle({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <StickerCircle
        label={label}
        fill={selected ? t.colors.primary : t.colors.surfaceAlt}
        ink={selected ? t.colors.onPrimary : t.colors.textMuted}
        edge={selected ? undefined : t.colors.borderStrong}
      />
    </Pressable>
  );
}

/** Every sticker badge's size, in points. */
export const STICKER_SIZE = 46;

// Clean places to break long words so they fit a small sticker without tiny letters.
const BREAKS: Record<string, string> = {
  background: 'Back-|ground',
  photography: 'Photo-|graphy',
  volunteering: 'Volun-|teering',
  networking: 'Network-|ing',
  basketball: 'Basket-|ball',
  watching: 'Watch-|ing',
  pickleball: 'Pickle-|ball',
  festivals: 'Festi-|vals',
};

/**
 * Fits a label inside a sticker: long words break in a sensible place, and the
 * letters shrink only as much as the longest piece needs.
 */
export function fitSticker(label: string, diameter: number) {
  const pieces = label.split(/\s+/).flatMap((w) => {
    const known = BREAKS[w.toLowerCase()];
    if (known) {
      const [a, b] = known.split('|') as [string, string];
      return [w[0] === w[0]!.toUpperCase() ? a : a.toLowerCase(), b];
    }
    if (w.length <= 9) return [w];
    const cut = Math.ceil(w.length / 2);
    return [`${w.slice(0, cut)}-`, w.slice(cut)];
  });
  const text = pieces.reduce((acc, p) => (acc ? (acc.endsWith('-') ? `${acc}\n${p}` : `${acc} ${p}`) : p), '');
  const longest = Math.max(...pieces.map((p) => p.length));
  const lines = text.split(/\n| /).length;
  const inner = diameter * 0.8;
  return { text, lines, size: Math.min(diameter * 0.2, inner / (longest * 0.6)) };
}
