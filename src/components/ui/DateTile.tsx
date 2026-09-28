import { View } from 'react-native';

import { MARKET_TIMEZONE } from '@/lib/time';
import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';

/** An event's date as a tear-off calendar block: weekday stamp, big day number, month. */
export function DateTile({ iso, size = 48 }: { iso: string; size?: number }) {
  const t = useTheme();
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: MARKET_TIMEZONE });
  const mono = { ...fontStyle(t.fonts.mono), fontSize: Math.round(size * 0.19), lineHeight: Math.round(size * 0.24), letterSpacing: 0.3, textTransform: 'uppercase' as const };
  return (
    <View
      accessible
      accessibilityLabel={part({ weekday: 'long', month: 'long', day: 'numeric' })}
      style={{
        width: size,
        minHeight: size + 6,
        borderRadius: t.radius.sm,
        backgroundColor: t.colors.surfaceAlt,
        borderTopWidth: 3,
        borderColor: t.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 2,
      }}>
      <AppText style={[mono, { color: t.colors.primaryText }]}>{part({ weekday: 'short' })}</AppText>
      <AppText style={{ ...fontStyle(t.fonts.display), fontSize: size * 0.42, lineHeight: size * 0.48, letterSpacing: -0.5, color: t.colors.text }}>{part({ day: 'numeric' })}</AppText>
      <AppText style={[mono, { color: t.colors.textSubtle }]}>{part({ month: 'short' })}</AppText>
    </View>
  );
}
