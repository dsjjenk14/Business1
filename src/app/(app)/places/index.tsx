import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, GlyphTile, GlyphTitle, LoadingList, Screen, SponsoredLabel } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { fetchFeaturedPlaces, type FeaturedPlace } from '@/features/places/api';
import { useTheme } from '@/theme';

/** Featured Places: partner venues with a member perk, and how many people you know have been. */
export default function FeaturedPlaces() {
  const t = useTheme();
  const router = useRouter();
  const { location } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;
  const [places, setPlaces] = useState<FeaturedPlace[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchFeaturedPlaces(lat, lng)
        .then((p) => setPlaces(p.sort((a, b) => (a.distance_mi ?? 999) - (b.distance_mi ?? 999))))
        .catch(() => setPlaces([]));
    }, [lat, lng]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Featured Places" />
      <Screen contentGap={t.space[4]}>
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
                    {p.network_visited} from your friends of friends have met up here
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
