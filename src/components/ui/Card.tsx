import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Tint the card with an accent (e.g. 'ai' for AI cards, 'trust' for vouch cards). */
  accent?: 'primary' | 'trust' | 'ai' | 'sponsored';
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, onPress, accessibilityLabel, accent, style }: CardProps) {
  const t = useTheme();
  const sticker = t.style.badge === 'sticker';
  const accentColor = accent ? t.colors[accent] : undefined;

  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: sticker ? t.borderWidth.strong : t.borderWidth.hairline,
    borderColor: sticker ? t.colors.outline : accentColor ?? t.colors.border,
    padding: t.space[4],
    boxShadow: sticker && accentColor ? `4px 4px 0px 0px ${accentColor}` : t.shadow.card,
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed ? { opacity: 0.85 } : null, style]}>
      {children}
    </Pressable>
  );
}
