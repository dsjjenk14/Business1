import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppText, Chip, useToast } from '@/components/ui';
import { applyFilter } from '@/features/photos/applyFilter';
import { FILTERS, type FilterKey } from '@/features/photos/filters';
import { useTheme } from '@/theme';

export type Filtered = Record<string, { key: FilterKey; uri: string }>;

/**
 * Filters for the photos in a post: pick a photo, then a filter. The filter
 * is baked into the photo, so it looks the same for everyone.
 */
export function PhotoFilters({ photos, value, onChange }: { photos: string[]; value: Filtered; onChange: (next: Filtered) => void }) {
  const t = useTheme();
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<FilterKey | null>(null);
  const original = photos[Math.min(selected, photos.length - 1)];
  if (!original) return null;
  const current = value[original]?.key ?? 'none';
  const shown = value[original]?.uri ?? original;

  async function pick(key: FilterKey) {
    if (!original || key === current) return;
    setBusy(key);
    try {
      const uri = await applyFilter(original, key);
      const next = { ...value };
      if (key === 'none') delete next[original];
      else next[original] = { key, uri };
      onChange(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t apply the filter.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Filters
      </AppText>
      <View style={{ borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt, aspectRatio: 4 / 5 }}>
        <Image
          source={{ uri: shown }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          accessibilityLabel={`Photo ${selected + 1}, filter: ${FILTERS.find((f) => f.key === current)?.label}`}
        />
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      {photos.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          {photos.map((p, i) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={`Edit photo ${i + 1}`}
              accessibilityState={{ selected: i === selected }}
              onPress={() => setSelected(i)}
              style={{
                width: 44,
                height: 44,
                borderRadius: t.radius.sm,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: i === selected ? t.colors.primary : 'transparent',
              }}>
              <Image source={{ uri: value[p]?.uri ?? p }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessible={false} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={current === f.key} onPress={() => pick(f.key)} />
        ))}
      </ScrollView>
    </View>
  );
}
