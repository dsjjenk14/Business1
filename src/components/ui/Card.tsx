import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { look } from './look';

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
  const accentColor = accent ? t.colors[accent] : undefined;

  const base: ViewStyle = look(t).flat
    ? {
        // Flat: a filled surface, no outline, no colored side bars (they read as
        // a template). An accent only shows as a faint hairline.
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.lg,
        borderWidth: accentColor ? t.borderWidth.hairline : 0,
        borderColor: accentColor ? `${accentColor}40` : 'transparent',
        padding: t.space[4],
      }
    : {
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.lg,
        borderWidth: t.borderWidth.hairline,
        borderColor: accentColor ?? t.colors.border,
        padding: t.space[4],
        boxShadow: t.shadow.card,
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
