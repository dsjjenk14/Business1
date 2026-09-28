import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { look } from './look';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'trust';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', size = 'lg', loading, disabled, icon, style, ...rest }: ButtonProps) {
  const t = useTheme();
  const isDisabled = disabled || loading;
  const { ticket } = look(t);

  const palette = {
    primary: { bg: t.colors.primary, fg: t.colors.onPrimary, border: t.colors.primary },
    trust: { bg: t.colors.trust, fg: t.colors.onTrust, border: t.colors.trust },
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
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 52 : 44,
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
          <AppText weight="bold" style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 15, letterSpacing: -0.2 }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
