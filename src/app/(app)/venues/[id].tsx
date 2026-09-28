import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, GlyphTile, GlyphTitle, LoadingDetail, Screen, Section, SponsoredLabel, Stars } from '@/components/ui';
import { fetchVenue, type VenueDetail } from '@/features/tonight/api';
import { dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** A venue: what it is, who you know that's been, and what's happening there. */
export default function Venue() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venue, setVenue] = useState<VenueDetail | null | undefined>(undefined);

  useEffect(() => {
    fetchVenue(Number(id))
      .then(setVenue)
      .catch(() => setVenue(null));
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={venue?.name ?? 'Venue'} />
      <Screen contentGap={t.space[5]}>
        {venue === undefined ? (
          <LoadingDetail />
        ) : !venue ? (
          <AppText tone="muted" align="center">
            This venue isn&apos;t available.
          </AppText>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: t.space[2] }}>
              <GlyphTile name={venue.emoji ?? 'pin'} size={64} />
              <AppText variant="h2" align="center" accessibilityRole="header">
                {venue.name}
              </AppText>
              <AppText tone="muted" align="center">
                {[venue.address, venue.neighborhood].filter(Boolean).join(' · ')}
              </AppText>
              {venue.rating?.count && venue.rating.avg != null ? (
                <Stars value={Number(venue.rating.avg)} count={venue.rating.count} />
              ) : (
                <AppText variant="small" tone="subtle">
                  No ratings yet. Go to an event here and rate it.
                </AppText>
              )}
              {venue.network_visited > 0 ? (
                <AppText tone="trust" weight="bold">
                  {venue.network_visited} from your network have met up here
                </AppText>
              ) : null}
            </View>

            {venue.placement ? (
              <Card accent="sponsored">
                <View style={{ gap: t.space[2] }}>
                  <SponsoredLabel kind={venue.placement.kind === 'sponsored' ? 'Sponsored' : 'Featured'} />
                  <GlyphTitle glyph="star" tone="sponsored">
                    {venue.placement.perk}
                  </GlyphTitle>
                  {venue.placement.perk_details ? (
                    <AppText variant="small" tone="muted">
                      {venue.placement.perk_details}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" tone="subtle">
                    Show your I&apos;m In profile when you order. Partners don&apos;t get your information.
                  </AppText>
                </View>
              </Card>
            ) : null}

            <Section title="Happening here">
              {venue.events.length ? (
                venue.events.map((e) => {
                  const spots = e.capacity != null ? Math.max(0, e.capacity - e.going_count) : null;
                  return (
                    <Card key={e.id} onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(e.id) } })} accessibilityLabel={e.title}>
                      <AppText weight="bold">
                        {e.title}
                      </AppText>
                      <AppText variant="small" tone="muted">
                        {[`${e.host_name} hosting`, dayTime(e.starts_at), spots != null ? (spots === 0 ? 'Full' : `${spots} spot${spots === 1 ? '' : 's'} left`) : `${e.going_count} going`].join(' · ')}
                      </AppText>
                    </Card>
                  );
                })
              ) : (
                <AppText variant="small" tone="muted">
                  Nothing planned here yet.
                </AppText>
              )}
            </Section>

            {venue.reviews?.length ? (
              <Section title="What people said">
                {venue.reviews.map((r, i) => (
                  <Card key={`${r.name}-${r.at}-${i}`}>
                    <View style={{ gap: t.space[1] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <AppText weight="bold">{r.name}</AppText>
                        <Stars value={r.stars} size={14} />
                      </View>
                      <AppText variant="small">{r.note}</AppText>
                      <AppText variant="caption" tone="subtle">
                        {timeAgo(r.at)}
                      </AppText>
                    </View>
                  </Card>
                ))}
              </Section>
            ) : null}

            {venue.description ? <AppText>{venue.description}</AppText> : null}
            {venue.price_level ? (
              <AppText tone="muted">
                Price: {'$'.repeat(venue.price_level)}
              </AppText>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
