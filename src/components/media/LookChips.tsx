import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { EFFECTS, type EffectKey } from '@/features/photos/effects';
import { currentOutFilters, FILTERS, filterSwatch, type FilterKey } from '@/features/photos/filters';
import { useTheme } from '@/theme';

/** A labeled, scrolling row of filter choices. */
export function FilterChips({ value, onChange, busy }: { value: FilterKey; onChange: (k: FilterKey) => void; busy?: boolean }) {
  return (
    <Row label="Filters">
      {FILTERS.map((f) => (
        <Chip key={f.key} label={f.label} selected={value === f.key} onPress={() => !busy && onChange(f.key)} />
      ))}
    </Row>
  );
}

/** A labeled, scrolling row of effect choices. */
export function EffectChips({ value, onChange, busy }: { value: EffectKey; onChange: (k: EffectKey) => void; busy?: boolean }) {
  return (
    <Row label="Effects">
      {EFFECTS.map((e) => (
        <Chip key={e.key} label={e.label} selected={value === e.key} onPress={() => !busy && onChange(e.key)} />
      ))}
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        {label}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Out filters: this drop's 8, each with a swatch of how it colors skin, and
 * when the next 8 arrive. "Original" is always first.
 */
export function OutFilterStrip({ value, onChange, busy }: { value: FilterKey; onChange: (k: FilterKey) => void; busy?: boolean }) {
  const t = useTheme();
  const { filters, daysLeft } = currentOutFilters();
  const items: { key: FilterKey; label: string }[] = [{ key: 'none', label: 'Original' }, ...filters];
  return (
    <View style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <AppText variant="label" tone="subtle">
          Filters
        </AppText>
        <AppText variant="caption" tone="subtle">
          8 new in {daysLeft === 1 ? '1 day' : `${daysLeft} days`}
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3] }}>
        {items.map((f) => {
          const on = value === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityLabel={`${f.label} filter`}
              accessibilityState={{ selected: on }}
              onPress={() => !busy && onChange(f.key)}
              style={{ alignItems: 'center', gap: 4, width: 60 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  padding: 3,
                  borderWidth: 2,
                  borderColor: on ? t.colors.primary : 'transparent',
                }}>
                <View style={{ flex: 1, borderRadius: 23, overflow: 'hidden', backgroundColor: filterSwatch(f.key) }}>
                  {/* A soft highlight, like light on skin. */}
                  <View style={{ position: 'absolute', top: 6, left: 8, width: 18, height: 14, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.35)' }} />
                </View>
              </View>
              <AppText variant="caption" weight={on ? 'bold' : undefined} numberOfLines={1}>
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
