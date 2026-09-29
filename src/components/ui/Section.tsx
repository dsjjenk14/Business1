import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { FadeIn } from './FadeIn';
import { look } from './look';

export type SectionProps = {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Render children without the boxed card (e.g. horizontal strips). */
  bare?: boolean;
};

/**
 * A titled block of content that eases in when it appears. Its shape follows the theme:
 *  - plain (Original, A, B): small label above open content
 *  - glass (C): frosted card with a soft label
 *  - ledger (D): hairline card with a header row
 *  - poster (Guest List): a big condensed title, a rule to the edge, open content
 */
export function Section({ title, action, children, style, bare }: SectionProps) {
  const t = useTheme();
  const { poster } = look(t);

  const actionEl = action ? (
    <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={10}>
      <AppText variant="small" weight="bold" tone="primary">
        {action.label} →
      </AppText>
    </Pressable>
  ) : null;

  const header = poster ? (
    <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], marginBottom: t.space[3] }}>
      <AppText style={{ flex: 1, ...fontStyle(t.fonts.display), fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: t.colors.text }}>{title}</AppText>
      {action ? (
        <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={10}>
          <AppText variant="small" weight="bold" tone="primary">
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  ) : (
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space[3] }}>
      <AppText variant="label" tone="subtle">
        {title}
      </AppText>
      {actionEl}
    </View>
  );

  if (t.style.section === 'plain' || poster || bare) {
    return (
      <FadeIn style={style}>
        {header}
        <View style={{ gap: t.space[3] }}>{children}</View>
      </FadeIn>
    );
  }

  return (
    <FadeIn style={style}>
      {header}
      <View
        style={{
          backgroundColor: t.colors.surface,
          borderWidth: t.borderWidth.hairline,
          borderColor: t.colors.border,
          borderRadius: t.radius.lg,
          padding: t.space[4],
          gap: t.space[3],
          boxShadow: t.shadow.card,
        }}>
        {children}
      </View>
    </FadeIn>
  );
}
