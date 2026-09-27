import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { MAX_FONT_SCALE, useTheme } from '@/theme';

import { AppText } from './AppText';

export type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  success?: string | null;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, optional, success, secureTextEntry, style, ...rest },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const borderColor = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;

  return (
    <View style={{ gap: t.space[1] + 2 }}>
      <AppText variant="small" weight="medium" tone="muted" nativeID={`${label}-label`}>
        {label}
        {optional ? <AppText variant="small" tone="subtle">  · Optional</AppText> : null}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.colors.surfaceAlt,
          borderWidth: t.borderWidth.regular,
          borderColor,
          borderRadius: t.radius.md,
          paddingHorizontal: t.space[4],
        }}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          placeholderTextColor={t.colors.textSubtle}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          secureTextEntry={secureTextEntry && hidden}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            { flex: 1, minHeight: 50, color: t.colors.text, fontFamily: t.fonts.body, fontSize: 16, outlineStyle: 'none' } as object,
            style,
          ]}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden((h) => !h)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={t.colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : success ? (
        <AppText variant="small" tone="trust">
          {success}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="subtle">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
