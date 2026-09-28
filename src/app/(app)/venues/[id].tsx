import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, GlyphTile, GlyphTitle, Screen, Section, SponsoredLabel } from '@/components/ui';
import { fetchVenue, type VenueDetail } from '@/features/tonight/api';
import { dayTime } from '@/lib/time';
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
          <AppText tone="subtle" align="center">
            Loading…
          </AppText>
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
