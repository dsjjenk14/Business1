import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText, Glyph, TextField, useToast } from '@/components/ui';
import { searchPlaces, venueFromPlace, type MapPlace } from '@/features/places/search';
import { searchVenues, type VenueHit } from '@/features/tonight/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

export type PlaceChoice = { venueId: number | null; text: string };

type Option =
  | { kind: 'venue'; key: string; name: string; sub: string; glyph: string; venue: VenueHit }
  | { kind: 'place'; key: string; name: string; sub: string; glyph: string; place: MapPlace };

const CATEGORY_GLYPH: Record<string, string> = {
  restaurant: 'dinner', fast_food: 'dinner', bar: 'drinks', pub: 'drinks', biergarten: 'drinks', wine_bar: 'wine',
  cafe: 'coffee', nightclub: 'music', theatre: 'music', arts_centre: 'music', park: 'outdoors', garden: 'outdoors',
  fitness_centre: 'fitness', sports_centre: 'fitness',
};

/**
 * "Where?": start typing and places near you drop down, from I'm In's own
 * venues and from the map (restaurants, bars, parks, neighborhoods). Pick one
 * to link it, or just keep what you typed.
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
  const toast = useToast();
  // Results for one query; anything for an older query is ignored.
  const [results, setResults] = useState<{ query: string; options: Option[] }>({ query: '', options: [] });
  const [picking, setPicking] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const query = value.venueId ? '' : value.text.trim();
  const options = query.length >= 2 && results.query === query ? results.options : [];
  const loading = query.length >= 2 && results.query !== query;
  const setOptions = (o: Option[]) => setResults({ query, options: o });

  useEffect(() => {
    let cancelled = false;
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      const [venues, places] = await Promise.all([
        searchVenues(query, lat, lng).catch(() => [] as VenueHit[]),
        searchPlaces(query, lat, lng),
      ]);
      if (cancelled) return;
      const own: Option[] = venues.slice(0, 4).map((v) => ({
        kind: 'venue',
        key: `v${v.id}`,
        name: v.name,
        sub: [v.neighborhood, v.distance_mi != null ? `${v.distance_mi} mi` : null].filter(Boolean).join(' · '),
        glyph: v.emoji ?? 'pin',
        venue: v,
      }));
      const ownNames = new Set(venues.map((v) => v.name.toLowerCase()));
      const map: Option[] = places
        .filter((p) => !ownNames.has(p.name.toLowerCase()))
        .map((p) => ({
          kind: 'place',
          key: p.osm_id,
          name: p.name,
          sub: [p.kind === 'area' ? 'Neighborhood' : p.address, p.neighborhood, p.distance_mi != null ? `${p.distance_mi} mi` : null]
            .filter(Boolean)
            .join(' · '),
          glyph: p.kind === 'area' ? 'globe' : (CATEGORY_GLYPH[p.category ?? ''] ?? 'pin'),
          place: p,
        }));
      setResults({ query, options: [...own, ...map].slice(0, 7) });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, lat, lng]);

  async function pick(o: Option) {
    if (o.kind === 'venue') {
      onChange({ venueId: o.venue.id, text: o.venue.name });
      setOptions([]);
      return;
    }
    // A neighborhood is just a place name, not a venue.
    if (o.place.kind === 'area') {
      onChange({ venueId: null, text: o.place.name });
      setOptions([]);
      return;
    }
    setPicking(o.key);
    try {
      const id = await venueFromPlace(o.place);
      onChange({ venueId: id, text: o.place.name });
      setOptions([]);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setPicking(null);
    }
  }

  const open = options.length > 0 && (focused || !!query);

  return (
    <View style={{ gap: t.space[2] }}>
      <TextField
        label={label}
        optional
        value={value.text}
        onChangeText={(text) => onChange({ venueId: null, text })}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        maxLength={80}
        placeholder="Start typing a place or neighborhood"
        autoCorrect={false}
      />
      {value.venueId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={t.colors.trust} />
          <AppText variant="caption" tone="trust">
            Linked to the venue page
          </AppText>
        </View>
      ) : loading && query.length >= 2 ? (
        <AppText variant="caption" tone="subtle">
          Looking near you…
        </AppText>
      ) : null}
      {open ? (
        <View
          accessibilityRole="list"
          style={{ borderRadius: t.radius.md, backgroundColor: t.colors.surface, overflow: 'hidden', borderWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
          {options.map((o, i) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityLabel={`Pick ${o.name}${o.sub ? `, ${o.sub}` : ''}`}
              onPress={() => pick(o)}
              disabled={!!picking}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                minHeight: 52,
                paddingHorizontal: t.space[3],
                backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                borderTopWidth: i ? t.borderWidth.hairline : 0,
                borderColor: t.colors.border,
              })}>
              <Glyph name={o.glyph} size={20} tone={o.kind === 'venue' ? 'primary' : 'muted'} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" weight="bold" numberOfLines={1}>
                  {o.name}
                </AppText>
                {o.sub ? (
                  <AppText variant="caption" tone="subtle" numberOfLines={1}>
                    {o.sub}
                  </AppText>
                ) : null}
              </View>
              {picking === o.key ? <ActivityIndicator color={t.colors.primary} /> : o.kind === 'venue' ? <AppText variant="caption" tone="primary">On I&apos;m In</AppText> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
