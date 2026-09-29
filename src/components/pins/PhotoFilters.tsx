import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { EffectChips, FilterChips } from '@/components/media/LookChips';
import { AppText, useToast } from '@/components/ui';
import { applyFilter } from '@/features/photos/applyFilter';
import { EFFECTS, type EffectKey } from '@/features/photos/effects';
import { FILTERS, MAX_SIDE, type FilterKey } from '@/features/photos/filters';
import { useTheme } from '@/theme';

export type Filtered = Record<string, { key: FilterKey; effect: EffectKey; uri: string }>;

/**
 * Filters and effects for the photos in a post: pick a photo, then a filter
 * and an effect. Both are baked into the photo, so it looks the same for everyone.
 */
export function PhotoFilters({ photos, value, onChange }: { photos: string[]; value: Filtered; onChange: (next: Filtered) => void }) {
  const t = useTheme();
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const original = photos[Math.min(selected, photos.length - 1)];
  if (!original) return null;
  const current = value[original]?.key ?? 'none';
  const effect = value[original]?.effect ?? 'none';
  const shown = value[original]?.uri ?? original;

  async function pick(key: FilterKey, fx: EffectKey) {
    if (!original || (key === current && fx === effect)) return;
    setBusy(true);
    try {
      const uri = await applyFilter(original, key, MAX_SIDE, fx);
      const next = { ...value };
      if (key === 'none' && fx === 'none') delete next[original];
      else next[original] = { key, effect: fx, uri };
      onChange(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t apply that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Filters & effects
      </AppText>
      <View style={{ borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt, aspectRatio: 4 / 5 }}>
        <Image
          source={{ uri: shown }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          accessibilityLabel={`Photo ${selected + 1}, filter: ${FILTERS.find((f) => f.key === current)?.label}, effect: ${EFFECTS.find((e) => e.key === effect)?.label}`}
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
      <FilterChips value={current} onChange={(k) => pick(k, effect)} busy={busy} />
      <EffectChips value={effect} onChange={(fx) => pick(current, fx)} busy={busy} />
    </View>
  );
}
