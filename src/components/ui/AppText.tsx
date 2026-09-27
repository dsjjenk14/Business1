import { Text, type TextProps } from 'react-native';

import { MAX_FONT_SCALE, useTheme, type Theme } from '@/theme';

type Variant = keyof Theme['type'];
type Tone = 'text' | 'muted' | 'subtle' | 'primary' | 'trust' | 'ai' | 'danger' | 'sponsored' | 'onPrimary' | 'onTrust' | 'onSectionBar';
type Weight = 'regular' | 'medium' | 'bold';

export type AppTextProps = TextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: Weight;
  align?: 'left' | 'center' | 'right';
};

const DISPLAY_VARIANTS: Variant[] = ['hero', 'h1', 'h2'];

/** All text in the app goes through this, so fonts and colors follow the theme. */
export function AppText({ variant = 'body', tone = 'text', weight, align, style, children, ...rest }: AppTextProps) {
  const t = useTheme();
  const type = t.type[variant];

  let fontFamily: string;
  if (variant === 'number' && t.style.monoNumbers) fontFamily = t.fonts.mono;
  else if (variant === 'number' || DISPLAY_VARIANTS.includes(variant)) fontFamily = weight === 'bold' || variant === 'hero' ? t.fonts.displayBold : t.fonts.display;
  else if (weight === 'bold' || variant === 'h3' || variant === 'label') fontFamily = t.fonts.bodyBold;
  else if (weight === 'medium') fontFamily = t.fonts.bodyMedium;
  else fontFamily = t.fonts.body;

  const colorMap: Record<Tone, string> = {
    text: t.colors.text,
    muted: t.colors.textMuted,
    subtle: t.colors.textSubtle,
    primary: t.colors.primary,
    trust: t.colors.trust,
    ai: t.colors.ai,
    danger: t.colors.danger,
    sponsored: t.colors.sponsored,
    onPrimary: t.colors.onPrimary,
    onTrust: t.colors.onTrust,
    onSectionBar: t.colors.onSectionBar,
  };

  const isLabel = variant === 'label';
  const content = isLabel && t.style.uppercaseLabels && typeof children === 'string' ? children.toUpperCase() : children;

  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[
        { fontFamily, color: colorMap[tone], fontSize: type.fontSize, lineHeight: type.lineHeight, letterSpacing: type.letterSpacing, textAlign: align },
        style,
      ]}
      {...rest}>
      {content}
    </Text>
  );
}
