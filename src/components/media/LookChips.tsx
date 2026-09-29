import { ScrollView, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { EFFECTS, type EffectKey } from '@/features/photos/effects';
import { FILTERS, type FilterKey } from '@/features/photos/filters';
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
