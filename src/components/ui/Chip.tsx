import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

/** Selectable pill, used for filters and choices. */
export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: t.space[3],
        justifyContent: 'center',
        borderRadius: t.radius.pill,
        borderWidth: t.borderWidth.regular,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : t.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <AppText variant="small" weight="bold" style={{ color: selected ? t.colors.onPrimary : t.colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}
