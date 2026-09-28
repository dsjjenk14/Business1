import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Wordmark: "I'M IN" in the poster face, with "IN" in the house red. */
export function Logo({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <AppText
      accessibilityRole="header"
      accessibilityLabel="I'm In"
      style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.15, color: t.colors.text, letterSpacing: size * 0.06 }}>
      I&apos;M <AppText style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.15, color: t.colors.primary, letterSpacing: size * 0.06 }}>IN</AppText>
    </AppText>
  );
}
