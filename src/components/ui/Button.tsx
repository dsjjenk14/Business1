import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { look } from './look';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'trust';

/** A hex color at some opacity, e.g. for a tinted button background. */
function tint(hex: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', size = 'lg', loading, disabled, icon, style, onPress, ...rest }: ButtonProps) {
  const t = useTheme();
  const isDisabled = disabled || loading;
  const { ticket } = look(t);

  const palette = {
    primary: { bg: t.colors.primary, fg: t.colors.onPrimary, border: t.colors.primary },
    // Softer than a second solid color: a tint with colored text, so each
    // screen has one loud button (the primary) and not two fighting.
    trust: { bg: tint(t.colors.trust, 0.16), fg: t.colors.trust, border: 'transparent' },
    danger: { bg: t.colors.danger, fg: t.colors.onDanger, border: t.colors.danger },
    secondary: ticket
      ? { bg: t.colors.surfaceAlt, fg: t.colors.text, border: t.colors.surfaceAlt }
      : { bg: t.colors.surfaceAlt, fg: t.colors.text, border: t.colors.border },
    ghost: { bg: 'transparent', fg: t.colors.textMuted, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        // A light tap for the main actions you take.
        if (variant === 'primary' || variant === 'trust') haptic.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 48 : 40,
          paddingHorizontal: t.space[5],
          borderRadius: t.radius.md,
          backgroundColor: palette.bg,
          borderWidth: variant === 'ghost' || ticket ? 0 : t.borderWidth.regular,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: t.space[2],
          opacity: isDisabled ? 0.5 : 1,
        },
        pressed ? { opacity: 0.8 } : null,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <AppText weight="bold" style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 14, letterSpacing: -0.2 }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
