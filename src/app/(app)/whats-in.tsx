import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { EventRow } from '@/components/home/HomeParts';
import { BackHeader } from '@/components/nav/AppHeader';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Card, GlyphTile, LoadingList, Section, Stars, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import type { HomeEvent } from '@/features/home/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchTopVenues, type TopVenue } from '@/features/ratings/api';
import { rsvp } from '@/features/tonight/api';
import { fetchWhatsIn, type WhatsIn as WhatsInData } from '@/features/trending/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * What's In: what's trending near you. Where people are In tonight, events
 * picking up the most people, the most talked-about pins, and the best-rated
 * places.
 */
export default function WhatsIn() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const { location } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;
  const [data, setData] = useState<WhatsInData | null>(null);
  const [pins, setPins] = useState<FeedPin[]>([]);
  const [places, setPlaces] = useState<TopVenue[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [w, p, v] = await Promise.all([
      fetchWhatsIn(lat, lng).catch(() => ({ hot_tonight: [], events: [] })),
      fetchFeed({ mode: 'trending', lat, lng, radiusMi: 25, limit: 10 }).catch(() => []),
      fetchTopVenues(lat, lng).catch(() => []),
    ]);
    setData(w);
    setPins(p);
    setPlaces(v.slice(0, 5));
  }, [lat, lng]);

  useFocusEffect(
    useCallback(() => {
      load();
      track('whats_in_opened');
    }, [load]),
  );

  async function onIn(e: HomeEvent) {
    if (!session) return;
    try {
      await rsvp(e.id, session.user.id);
      toast(`You're in: ${e.title}`);
      enableArrivalWatch();
      load();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  const empty = data && !data.hot_tonight.length && !data.events.length && !pins.length && !places.length;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="What's In" />
      <ScrollView
        contentContainerStyle={{ padding: t.space[4], gap: t.space[6], paddingBottom: t.space[8], width: '100%', maxWidth: 640, alignSelf: 'center' }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={t.colors.primary}
          />
        }>
        <AppText tone="muted">Trending events, hot spots and posts near you right now.</AppText>
        {!data ? (
          <LoadingList rows={5} />
        ) : empty ? (
          <Card>
            <AppText weight="bold">Quiet around here</AppText>
            <AppText variant="small" tone="muted">
              When people say I&apos;m In, post and plan things near you, the busiest spots show up here.
            </AppText>
          </Card>
        ) : null}

        {data?.events.length ? (
          <Section title="Trending events">
            <Card>
              <View style={{ gap: t.space[2] }}>
                {data.events.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    subtitle={null}
                    onIn={() => onIn(e)}
                  />
                ))}
              </View>
            </Card>
          </Section>
        ) : null}

        {data?.hot_tonight.length ? (
          <Section title="Hot tonight">
            {data.hot_tonight.map((h, i) => (
              <Card
                key={h.venue_id}
                onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(h.venue_id) } })}
                accessibilityLabel={`${h.name}: ${h.people} ${h.people === 1 ? 'person is' : 'people are'} In tonight${h.friends ? `, ${h.friends} you know` : ''}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <AppText variant="h1" tone="primary" style={{ width: 30, textAlign: 'center' }}>
                    {i + 1}
                  </AppText>
                  <GlyphTile name={h.glyph ?? 'pin'} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {h.name}
                    </AppText>
                    <AppText variant="small" tone="primary" weight="bold">
                      {h.people} In tonight{h.friends ? ` · ${h.friends} you know` : ''}
                    </AppText>
                    <AppText variant="caption" tone="subtle">
                      {[h.neighborhood, h.distance_mi != null ? `${h.distance_mi} mi` : null].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))}
          </Section>
        ) : null}

        {pins.length ? (
          <Section title="Trending pins">
            {pins.map((p) => (
              <PinCard key={p.id} pin={p} locationMode="distance" onChange={(next) => setPins((all) => all.map((x) => (x.id === next.id ? next : x)))} />
            ))}
          </Section>
        ) : null}

        {places.length ? (
          <Section title="Top rated places" action={{ label: 'All places', onPress: () => router.push('/places') }}>
            {places.map((v, i) => (
              <Card
                key={v.venue_id}
                onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(v.venue_id) } })}
                accessibilityLabel={`Number ${i + 1}: ${v.name}, ${v.avg_stars} stars`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <GlyphTile name={v.glyph ?? 'pin'} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {v.name}
                    </AppText>
                    <Stars value={Number(v.avg_stars)} size={14} count={v.ratings} />
                  </View>
                </View>
              </Card>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}
