import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Glyph, type GlyphName } from './Glyph';
import { look } from './look';

/** Selectable pill, used for filters and choices. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  glyph,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  glyph?: GlyphName;
}) {
  const t = useTheme();
  const { ticket } = look(t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: t.space[3],
        justifyContent: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: ticket ? t.radius.sm : t.radius.pill,
        borderWidth: ticket ? 0 : t.borderWidth.regular,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : ticket ? t.colors.surfaceAlt : t.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      {glyph ? <Glyph name={glyph} size={label ? 15 : 20} color={selected ? t.colors.onPrimary : t.colors.textMuted} strokeWidth={2} /> : null}
      {label ? (
        ticket ? (
          // Tag style: mono small caps, like a wristband stamp.
          <AppText
            style={{
              color: selected ? t.colors.onPrimary : t.colors.text,
              fontFamily: t.fonts.mono, textTransform: 'uppercase',
              fontSize: 11.5,
              lineHeight: 15,
              letterSpacing: 0.6,
            }}>
            {label}
          </AppText>
        ) : (
          <AppText variant="small" weight="bold" style={{ color: selected ? t.colors.onPrimary : t.colors.textMuted }}>
            {label}
          </AppText>
        )
      ) : null}
    </Pressable>
  );
}
