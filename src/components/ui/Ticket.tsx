import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

/**
 * The ticket stub: I'm In's signature shape for things you're "in" on
 * (events, bills, passes). A main part and a stub, split by a perforated
 * line with a half-circle notch cut from each side.
 */
export function Ticket({
  children,
  stub,
  onPress,
  accessibilityLabel,
  accent = 'primary',
  style,
}: {
  children: React.ReactNode;
  /** The tear-off part on the right (a time, a price, a button). */
  stub?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accent?: 'primary' | 'trust' | 'sponsored' | 'none';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const notch = 14;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View style={{ flex: 1, padding: t.space[4], gap: t.space[1] }}>{children}</View>
      {stub ? (
        <>
          {/* The perforation, with a notch cut from the top and bottom edges. */}
          <View style={{ width: 2 }}>
            <View style={{ flex: 1, marginVertical: notch / 2 + 4, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: t.colors.borderStrong }} />
            <View style={{ position: 'absolute', top: -notch / 2 - 3, left: 1 - notch / 2, width: notch, height: notch, borderRadius: notch / 2, backgroundColor: t.colors.bg }} />
            <View style={{ position: 'absolute', bottom: -notch / 2, left: 1 - notch / 2, width: notch, height: notch, borderRadius: notch / 2, backgroundColor: t.colors.bg }} />
          </View>
          <View style={{ minWidth: 92, padding: t.space[3], alignItems: 'center', justifyContent: 'center', gap: t.space[1] }}>{stub}</View>
        </>
      ) : null}
    </View>
  );
  const frame: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    borderTopWidth: accent === 'none' ? 0 : 3,
    borderColor: accent === 'none' ? 'transparent' : t.colors[accent],
  };
  if (!onPress) return <View style={[frame, style]}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [frame, pressed ? { opacity: 0.85 } : null, style]}>
      {body}
    </Pressable>
  );
}

/** The small print on a ticket: mono, spaced out, like a stamp ("SAT · 9:00 PM"). */
export function Stamp({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'primary' | 'trust' | 'text' }) {
  const t = useTheme();
  const color = tone === 'muted' ? t.colors.textMuted : tone === 'primary' ? t.colors.primaryText : tone === 'trust' ? t.colors.trust : t.colors.text;
  return <AppText style={{ color, fontFamily: t.fonts.mono, textTransform: 'uppercase', fontSize: 10.5, lineHeight: 14, letterSpacing: 1 }}>{children}</AppText>;
}
