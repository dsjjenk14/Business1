import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

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
    // A little tilt, the same every time for the same word, like a sticker slapped on.
    // Shrink the letters so the longest word always fits on one line inside the circle.
    const longest = Math.max(...label.split(/\s+/).map((w) => w.length));
    const size = Math.min(11, 50 / (longest * 0.6));
    const tilt = ((label.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % 13) - 6) * 1.2;
    return (
      <View
        style={{
          width: 66,
          height: 66,
          borderRadius: 33,
          backgroundColor: fill,
          borderWidth: 2.5,
          borderColor: t.mode === 'dark' ? '#F5F5F5' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
          gap: 1,
          transform: [{ rotate: `${tilt}deg` }],
        }}>
        {glyph ? <Glyph name={glyph} size={12} color={ink} strokeWidth={2.4} /> : null}
        <AppText
          align="center"
          numberOfLines={3}
          style={{ color: ink, ...fontStyle(t.fonts.displayBold), fontSize: size, lineHeight: Math.round(size * 1.15) }}>
          {label}
        </AppText>
      </View>
    );
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
