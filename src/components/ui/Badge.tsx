import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { useTheme } from '@/theme';

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
        <AppText variant="caption" style={{ color, fontFamily: t.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </AppText>
      </View>
    );
  }

  if (look(t).ticket) {
    // A stamp: square corners, mono small caps.
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderWidth: t.borderWidth.regular,
          borderColor: color,
          borderRadius: 2,
          paddingHorizontal: 6,
          paddingVertical: 2,
        }}>
        {glyph ? <Glyph name={glyph} size={12} color={color} strokeWidth={2.2} /> : null}
        <AppText style={{ color, fontFamily: t.fonts.mono, textTransform: 'uppercase', fontSize: 10.5, lineHeight: 14, letterSpacing: 0.6 }}>{label}</AppText>
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
