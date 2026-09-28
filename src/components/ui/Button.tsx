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
      ? { bg: 'transparent', fg: t.colors.text, border: t.colors.borderStrong }
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
          borderRadius: ticket ? t.radius.sm : t.radius.md,
          backgroundColor: palette.bg,
          borderWidth: variant === 'ghost' ? 0 : ticket ? t.borderWidth.strong : t.borderWidth.regular,
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
          {ticket && variant !== 'ghost' ? (
            // Poster buttons: the condensed display face, like a wristband or a door sign.
            <AppText
              style={{
                color: palette.fg,
                fontFamily: t.fonts.display,
                fontSize: size === 'lg' ? 21 : 18,
                lineHeight: size === 'lg' ? 24 : 20,
                letterSpacing: 1,
                paddingTop: 2,
              }}>
              {label}
            </AppText>
          ) : (
            <AppText weight="bold" style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 14 }}>
              {label}
            </AppText>
          )}
        </>
      )}
    </Pressable>
  );
}
