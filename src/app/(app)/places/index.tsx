import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, GlyphTile, GlyphTitle, LoadingList, Screen, Section, SponsoredLabel, Stars } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { fetchFeaturedPlaces, type FeaturedPlace } from '@/features/places/api';
import { fetchPlacesToRate, fetchTopVenues, type PlaceToRate, type TopVenue } from '@/features/ratings/api';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * Places: the best-rated spots near you (rated by people who went to events
 * there), places you went and haven't rated, and partner venues with perks.
 */
export default function Places() {
  const t = useTheme();
  const router = useRouter();
  const { location } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;
  const [places, setPlaces] = useState<FeaturedPlace[] | null>(null);
  const [top, setTop] = useState<TopVenue[]>([]);
  const [toRate, setToRate] = useState<PlaceToRate[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchFeaturedPlaces(lat, lng)
        .then((p) => setPlaces(p.sort((a, b) => (a.distance_mi ?? 999) - (b.distance_mi ?? 999))))
        .catch(() => setPlaces([]));
      fetchTopVenues(lat, lng)
        .then(setTop)
        .catch(() => undefined);
      fetchPlacesToRate()
        .then(setToRate)
        .catch(() => undefined);
    }, [lat, lng]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Places" />
      <Screen contentGap={t.space[4]}>
        {toRate.length ? (
          <Section title="Rate the places you went">
            {toRate.map((p) => (
              <Card
                key={p.event_id}
                accent="sponsored"
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(p.event_id) } })}
                accessibilityLabel={`Rate ${p.venue_name}, from ${p.title}`}>
                <GlyphTitle glyph="star" tone="sponsored" variant="small">
                  {`Rate ${p.venue_name}`}
                </GlyphTitle>
                <AppText variant="caption" tone="subtle">
                  {`${p.title} · ${dayTime(p.starts_at)}`}
                </AppText>
              </Card>
            ))}
          </Section>
        ) : null}

        <Section title="Top rated near you">
          {top.length ? (
            top.map((v, i) => (
              <Card
                key={v.venue_id}
                onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(v.venue_id) } })}
                accessibilityLabel={`Number ${i + 1}: ${v.name}, ${v.avg_stars} stars from ${v.ratings} ratings`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <AppText variant="h3" tone="sponsored" style={{ width: 28, textAlign: 'center' }}>
                    {i + 1}
                  </AppText>
                  <GlyphTile name={v.glyph ?? 'pin'} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {v.name}
                    </AppText>
                    <Stars value={Number(v.avg_stars)} size={14} count={v.ratings} />
                    <AppText variant="caption" tone="subtle">
                      {[v.neighborhood, v.distance_mi != null ? `${v.distance_mi} mi` : null].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <AppText variant="small" tone="muted">
              No ratings nearby yet. After an event, rate the place from the event page.
            </AppText>
          )}
        </Section>

        <AppText variant="label" tone="subtle">
          FEATURED
        </AppText>
        <AppText tone="muted">Partner spots with perks for I&apos;m In members. Every one is labeled, and partners never see who you are.</AppText>
        {places === null ? (
          <LoadingList />
        ) : places.length === 0 ? (
          <Card>
            <AppText weight="bold">No featured places yet</AppText>
            <AppText variant="small" tone="muted">
              Partner venues and their member perks will show up here.
            </AppText>
          </Card>
        ) : (
          places.map((p) => (
            <Card
              key={p.placement_id}
              onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(p.venue_id) } })}
              accessibilityLabel={`${p.name}. ${p.perk}`}>
              <View style={{ gap: t.space[2] }}>
                <SponsoredLabel kind={p.kind === 'sponsored' ? 'Sponsored' : 'Featured'} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <GlyphTile name={p.glyph ?? 'pin'} size={48} tone="sponsored" />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{p.name}</AppText>
                    <AppText variant="caption" tone="subtle">
                      {[p.neighborhood, p.price_level ? '$'.repeat(p.price_level) : null, p.distance_mi != null ? `${p.distance_mi} mi` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  </View>
                </View>
                <GlyphTitle glyph="star" tone="sponsored" variant="small">
                  {p.perk}
                </GlyphTitle>
                {p.network_visited ? (
                  <AppText variant="caption" tone="trust">
                    {p.network_visited} from your network have met up here
                  </AppText>
                ) : null}
              </View>
            </Card>
          ))
        )}
        <Card onPress={() => router.push('/places/partner')} accessibilityLabel="Become a partner">
          <GlyphTitle glyph="briefcase">Own a venue? Become a partner</GlyphTitle>
          <AppText variant="small" tone="muted">
            Offer a perk to trusted members and get featured.
          </AppText>
        </Card>
      </Screen>
    </View>
  );
}
