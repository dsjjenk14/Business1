import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

/** Sub-tabs inside a screen (e.g. Nearby / They're In). */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: t.colors.surface, borderRadius: t.radius.md, padding: 3, borderWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.key)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md - 2, backgroundColor: selected ? t.colors.surfaceAlt : 'transparent' }}>
            <AppText variant="small" weight="bold" tone={selected ? 'text' : 'subtle'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
