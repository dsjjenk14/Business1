import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

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
  /** Stamp animation on press. On by default for "I'm In". */
  stamp?: boolean;
};

export function Button({ label, variant = 'primary', size = 'lg', loading, disabled, icon, style, onPress, stamp, ...rest }: ButtonProps) {
  const t = useTheme();
  // "I'm In" buttons stamp: the words punch down and bounce back, with a buzz.
  const stamps = stamp ?? /^I['’]m In$/.test(label);
  const reduce = useReducedMotion();
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }, { rotate: `${(1 - pop.get()) * -20}deg` }] }));
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
        if (stamps) {
          haptic.success();
          if (!reduce) pop.set(withSequence(withTiming(0.82, { duration: 70 }), withSpring(1, { damping: 6, stiffness: 320 })));
        } else if (variant === 'primary' || variant === 'trust') haptic.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 48 : 40,
          paddingHorizontal: t.space[5],
          // Ticket themes are square-cut; soft themes use fully rounded buttons.
          borderRadius: ticket ? t.radius.md : t.radius.pill,
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
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }, popStyle]}>
          {icon ? <View>{icon}</View> : null}
          <AppText weight="bold" style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 14, letterSpacing: -0.2 }}>
            {label}
          </AppText>
        </Animated.View>
      )}
    </Pressable>
  );
}
