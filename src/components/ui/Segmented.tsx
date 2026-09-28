import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { look } from './look';

/** Sub-tabs inside a screen (e.g. Nearby / They're In). */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  if (look(t).ticket) {
    // Underlined tabs set in the poster face.
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: t.space[5], borderBottomWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
        {options.map((o) => {
          const selected = o.key === value;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.key)}
              style={{ minHeight: 44, justifyContent: 'flex-end', paddingBottom: t.space[2], marginBottom: -1, borderBottomWidth: 3, borderColor: selected ? t.colors.primary : 'transparent' }}>
              <AppText style={{ fontFamily: t.fonts.display, fontSize: 21, lineHeight: 24, letterSpacing: 0.8, color: selected ? t.colors.text : t.colors.textSubtle }}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }
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
