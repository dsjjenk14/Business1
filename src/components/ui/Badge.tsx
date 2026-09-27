import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export type BadgeProps = {
  label: string;
  tone?: 'primary' | 'trust' | 'ai' | 'sponsored' | 'neutral';
  emoji?: string;
  /** Slight tilt for sticker-style themes; pass different values for variety. */
  tilt?: number;
  verified?: boolean;
};

/** Tier chips, profile badges, founding-member tags. Shape follows theme.style.badge. */
export function Badge({ label, tone = 'primary', emoji, tilt = -2, verified }: BadgeProps) {
  const t = useTheme();
  const color = tone === 'neutral' ? t.colors.textMuted : t.colors[tone];
  const onColor = { primary: t.colors.onPrimary, trust: t.colors.onTrust, ai: t.colors.onAi, sponsored: t.colors.onSponsored, neutral: t.colors.bg }[tone];

  if (t.style.badge === 'sticker') {
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: color,
          borderWidth: t.borderWidth.regular,
          borderColor: t.colors.outline,
          borderRadius: t.radius.sm,
          paddingHorizontal: t.space[2],
          paddingVertical: 3,
          transform: [{ rotate: `${tilt}deg` }],
          boxShadow: t.shadow.pressed,
        }}>
        {emoji ? <AppText variant="small">{emoji}</AppText> : null}
        <AppText variant="small" weight="bold" style={{ color: onColor, fontFamily: t.fonts.displayBold }}>
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
        <AppText variant="caption" style={{ color, fontFamily: t.fonts.mono, letterSpacing: 0.8 }}>
          {label.toUpperCase()}
        </AppText>
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
      {emoji ? <AppText variant="caption">{emoji}</AppText> : null}
      <AppText variant="caption" weight="bold" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}
