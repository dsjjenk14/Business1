import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Wordmark. In sticker themes it gets a tilted, outlined treatment. */
export function Logo({ size = 22 }: { size?: number }) {
  const t = useTheme();
  if (t.style.badge === 'sticker') {
    return (
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel="I'm In"
        style={{
          alignSelf: 'flex-start',
          backgroundColor: t.colors.primary,
          borderWidth: t.borderWidth.strong,
          borderColor: t.colors.outline,
          borderRadius: t.radius.sm,
          paddingHorizontal: t.space[2],
          paddingVertical: 1,
          transform: [{ rotate: '-3deg' }],
          boxShadow: `3px 3px 0px 0px ${t.colors.secondary}`,
        }}>
        <AppText style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.2, color: t.colors.onPrimary }}>I&apos;M IN</AppText>
      </View>
    );
  }
  return (
    <AppText accessibilityRole="header" style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.2, color: t.colors.text, letterSpacing: 1 }}>
      I&apos;M IN
      <AppText style={{ color: t.colors.primary, fontFamily: t.fonts.displayBold, fontSize: size }}>.</AppText>
    </AppText>
  );
}
