import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { fetchInterestOptions, type InterestOption } from '@/features/ai/api';
import { useTheme } from '@/theme';

export const MAX_INTERESTS = 12;

/** Pick up to 12 interests. They show on your profile and power People like you. */
export function InterestsPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const t = useTheme();
  const [options, setOptions] = useState<InterestOption[] | null>(null);

  useEffect(() => {
    fetchInterestOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : value.length >= MAX_INTERESTS ? value : [...value, key]);

  const groups = (options ?? []).reduce<Record<string, InterestOption[]>>((acc, o) => {
    (acc[o.category] ??= []).push(o);
    return acc;
  }, {});

  return (
    <View style={{ gap: t.space[3] }}>
      <View style={{ gap: 2 }}>
        <AppText variant="small" weight="medium" tone="muted">
          Interests ({value.length}/{MAX_INTERESTS})
        </AppText>
        <AppText variant="caption" tone="subtle">
          On your profile, and how we find people who are into the same things.
        </AppText>
      </View>
      {Object.entries(groups).map(([category, list]) => (
        <View key={category} style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            {category}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {list.map((o) => (
              <Chip key={o.key} label={o.label} selected={value.includes(o.key)} onPress={() => toggle(o.key)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
