import { AppText } from '@/components/ui';
import { useTheme, fontStyle } from '@/theme';

/** Wordmark: "I'm In", heavy and tight, with "In" in the house red. */
export function Logo({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <AppText
      accessibilityRole="header"
      accessibilityLabel="I'm In"
      style={{ ...fontStyle(t.fonts.displayBold), fontSize: size * 0.92, lineHeight: size * 1.15, color: t.colors.text, letterSpacing: -size * 0.04 }}>
      I&apos;m <AppText style={{ ...fontStyle(t.fonts.displayBold), fontSize: size * 0.92, lineHeight: size * 1.15, color: t.colors.primary, letterSpacing: -size * 0.04 }}>In</AppText>
    </AppText>
  );
}
