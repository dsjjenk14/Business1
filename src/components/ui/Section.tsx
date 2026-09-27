import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export type SectionProps = {
  title: string;
  /** Picks the title-bar color in Theme E (rotates through theme.colors.sectionBars). */
  colorIndex?: number;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Render children without the boxed card (e.g. horizontal strips). */
  bare?: boolean;
};

/**
 * A titled block of content. Its shape follows the theme:
 *  - titlebar (E): boxed card with a colored title bar, MySpace-style
 *  - plain (A, B): small label above open content
 *  - glass (C): frosted card with a soft label
 *  - ledger (D): hairline card with a header row
 */
export function Section({ title, colorIndex = 0, action, children, style, bare }: SectionProps) {
  const t = useTheme();
  const bars = t.colors.sectionBars;
  const barColor = bars[colorIndex % bars.length] ?? t.colors.primary;

  const actionEl = action ? (
    <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={10}>
      <AppText variant="small" weight="bold" tone={t.style.section === 'titlebar' ? 'onSectionBar' : 'primary'}>
        {action.label} →
      </AppText>
    </Pressable>
  ) : null;

  if (t.style.section === 'titlebar') {
    return (
      <View
        style={[
          {
            borderWidth: t.borderWidth.strong,
            borderColor: t.colors.outline,
            borderRadius: t.radius.lg,
            backgroundColor: t.colors.surface,
            overflow: 'hidden',
            boxShadow: t.shadow.card,
          },
          style,
        ]}>
        <View
          accessibilityRole="header"
          style={{
            backgroundColor: barColor,
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[2],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: t.borderWidth.strong,
            borderColor: t.colors.outline,
          }}>
          <AppText variant="label" tone="onSectionBar" style={{ fontFamily: t.fonts.displayBold, fontSize: 13 }}>
            {title}
          </AppText>
          {actionEl}
        </View>
        <View style={bare ? undefined : { padding: t.space[4], gap: t.space[3] }}>{children}</View>
      </View>
    );
  }

  const header = (
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space[3] }}>
      <AppText variant="label" tone="subtle">
        {title}
      </AppText>
      {actionEl}
    </View>
  );

  if (t.style.section === 'plain' || bare) {
    return (
      <View style={style}>
        {header}
        <View style={{ gap: t.space[3] }}>{children}</View>
      </View>
    );
  }

  return (
    <View style={style}>
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
    </View>
  );
}
