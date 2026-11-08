import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Chip, StickerToggle, TextField } from '@/components/ui';
import { fetchInterestOptions, type InterestOption } from '@/features/ai/api';
import { useTheme } from '@/theme';

export const MAX_INTERESTS = 12;

/** Pick up to 12 interests. They show on your profile and power People like you. */
export function InterestsPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const t = useTheme();
  const [options, setOptions] = useState<InterestOption[] | null>(null);
  const [query, setQuery] = useState('');
  // Themes with round sticker badges pick interests with round stickers too.
  const round = t.style.badge === 'sticker';

  useEffect(() => {
    fetchInterestOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : value.length >= MAX_INTERESTS ? value : [...value, key]);

  const q = query.trim().toLowerCase();
  const picked = (options ?? []).filter((o) => value.includes(o.key));
  const groups = (options ?? []).filter((o) => !q || o.label.toLowerCase().includes(q)).reduce<Record<string, InterestOption[]>>((acc, o) => {
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
          Shown on your profile. We use them to find your people.
        </AppText>
      </View>
      {picked.length ? (
        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            Your picks
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {picked.map((o) =>
              round ? (
                <StickerToggle key={o.key} label={o.label} selected onPress={() => toggle(o.key)} />
              ) : (
                <Chip key={o.key} label={o.label} selected onPress={() => toggle(o.key)} />
              ),
            )}
          </View>
        </View>
      ) : null}
      <TextField label="Search interests" value={query} onChangeText={setQuery} placeholder="Brunch, jazz, hiking…" autoCorrect={false} />
      {Object.entries(groups).map(([category, list]) => (
        <View key={category} style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            {category}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {list.filter((o) => !value.includes(o.key)).map((o) =>
              round ? (
                <StickerToggle key={o.key} label={o.label} selected={value.includes(o.key)} onPress={() => toggle(o.key)} />
              ) : (
                <Chip key={o.key} label={o.label} selected={value.includes(o.key)} onPress={() => toggle(o.key)} />
              ),
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
