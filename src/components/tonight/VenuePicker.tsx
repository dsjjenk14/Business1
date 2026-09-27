import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, TextField } from '@/components/ui';
import { searchVenues, type VenueHit } from '@/features/tonight/api';
import { useTheme } from '@/theme';

export type PlaceChoice = { venueId: number | null; text: string };

/**
 * "Where?": type a place. Matching venues show underneath; pick one to link it
 * (so people can see who's there), or just keep what you typed.
 */
export function VenuePicker({
  value,
  onChange,
  lat,
  lng,
  label = 'Where?',
}: {
  value: PlaceChoice;
  onChange: (v: PlaceChoice) => void;
  lat?: number | null;
  lng?: number | null;
  label?: string;
}) {
  const t = useTheme();
  const [hits, setHits] = useState<VenueHit[]>([]);
  const query = value.venueId ? '' : value.text.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        if (query.length < 2) {
          if (!cancelled) setHits([]);
          return;
        }
        searchVenues(query, lat, lng)
          .then((r) => !cancelled && setHits(r.slice(0, 5)))
          .catch(() => !cancelled && setHits([]));
      },
      query.length < 2 ? 0 : 250,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, lat, lng]);

  return (
    <View style={{ gap: t.space[2] }}>
      <TextField
        label={label}
        optional
        value={value.text}
        onChangeText={(text) => onChange({ venueId: null, text })}
        maxLength={80}
        placeholder="Restaurant, bar, park, or neighborhood"
      />
      {value.venueId ? (
        <AppText variant="caption" tone="trust">
          ✓ Linked to the venue page
        </AppText>
      ) : null}
      {hits.map((v) => (
        <Pressable
          key={v.id}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${v.name}${v.neighborhood ? `, ${v.neighborhood}` : ''}`}
          onPress={() => {
            onChange({ venueId: v.id, text: v.name });
            setHits([]);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[3],
            minHeight: 44,
            paddingHorizontal: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surface,
            borderWidth: t.borderWidth.hairline,
            borderColor: t.colors.border,
          }}>
          <AppText>{v.emoji ?? '📍'}</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="small" weight="bold">
              {v.name}
            </AppText>
            <AppText variant="caption" tone="subtle">
              {[v.neighborhood, v.distance_mi != null ? `${v.distance_mi} mi` : null].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
