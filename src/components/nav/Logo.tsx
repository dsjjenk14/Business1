import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Wordmark: "I'M IN" in the theme's display face (Bebas Neue in the Original theme). */
export function Logo({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <AppText
      accessibilityRole="header"
      style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.15, color: t.colors.text, letterSpacing: size * 0.06 }}>
      I&apos;M IN
    </AppText>
  );
}
