import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { DateStrip } from '@/components/home/DateStrip';
import { EventFeedCard, FirstFriendsCard, LiveCard, NewConnectionCard } from '@/components/home/FeedCards';
import { PeopleRow } from '@/components/home/PeopleRow';
import { PinCard } from '@/components/pins/PinCard';
import { PlacementCard } from '@/components/places/PlacementCard';
import { AppText, Card, EmptyState, LoadingList, Segmented, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import {
  cacheHome,
  fetchHomeFeed,
  readCachedHome,
  readScope,
  saveScope,
  shareEvent,
  type HomeConnection,
  type HomeEvent,
  type HomeFeed,
  type HomeLive,
  type HomeScope,
} from '@/features/home/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import type { FeedPin } from '@/features/pins/api';
import type { FeedPlacement } from '@/features/places/api';
import { rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Item =
  | { key: string; type: 'pin'; pin: FeedPin }
  | { key: string; type: 'live'; group: HomeLive[] }
  | { key: string; type: 'event'; event: HomeEvent }
  | { key: string; type: 'connection'; person: HomeConnection }
  | { key: string; type: 'placement'; place: FeedPlacement };

/** One feed: live moments first, then pins with events, new friends and one partner card mixed in. */
function buildFeed(feed: HomeFeed): Item[] {
  // Live moments, one card per place (up to 2 places).
  const places = new Map<string, HomeLive[]>();
  feed.live.forEach((l) => places.set(l.place, [...(places.get(l.place) ?? []), l]));
  const items: Item[] = [...places.entries()].slice(0, 2).map(([place, group]) => ({ key: `live-${place}`, type: 'live', group }));
  // After which pin each extra card goes.
  const extras = new Map<number, Item>();
  const [e0, e1, e2] = feed.events;
  const [c0, c1] = feed.new_connections;
  if (e0) extras.set(1, { key: `event-${e0.id}`, type: 'event', event: e0 });
  if (feed.placement) extras.set(2, { key: 'placement', type: 'placement', place: feed.placement });
  if (c0) extras.set(3, { key: `conn-${c0.id}`, type: 'connection', person: c0 });
  if (e1) extras.set(5, { key: `event-${e1.id}`, type: 'event', event: e1 });
  if (c1) extras.set(7, { key: `conn-${c1.id}`, type: 'connection', person: c1 });
  if (e2) extras.set(9, { key: `event-${e2.id}`, type: 'event', event: e2 });
  feed.pins.forEach((p, i) => {
    items.push({ key: `pin-${p.id}`, type: 'pin', pin: p });
    const extra = extras.get(i);
    if (extra) items.push(extra);
  });
  // Few pins yet: still show the events and new friends.
  extras.forEach((item, at) => {
    if (at >= feed.pins.length) items.push(item);
  });
  return items;
}

/**
 * Home: what's happening with your people right now.
 * People row (who's In, going out, posted) → Friends | Everyone → one feed.
 * Opens instantly from the last saved copy, then refreshes.
 */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile, session } = useAuth();
  const me = session?.user.id;
  const { location } = useApproxLocation();
  const { dismissed } = useFirstWeekChecklist();
  const shownChecklist = useRef(false);

  const [scope, setScope] = useState<HomeScope | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    readScope().then(setScope);
  }, []);

  // First-week checklist pops up once after first login, until dismissed.
  useEffect(() => {
    if (dismissed === false && !shownChecklist.current) {
      shownChecklist.current = true;
      router.push('/checklist');
    }
  }, [dismissed, router]);

  const load = useCallback(async () => {
    if (!me || !scope) return;
    try {
      const next = await fetchHomeFeed(scope, location);
      setFeed(next);
      setError(false);
      cacheHome(me, scope, next);
    } catch {
      setError(true);
    }
  }, [me, scope, location]);

  // Show the saved copy right away, then refresh.
  useEffect(() => {
    if (!me || !scope) return;
    let cancelled = false;
    readCachedHome(me, scope).then((cached) => {
      if (!cancelled && cached) setFeed((f) => f ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [me, scope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (scope) track('home_opened', { scope });
  }, [scope]);

  function changeScope(next: HomeScope) {
    setFeed(null);
    setScope(next);
    saveScope(next);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onIn(eventId: number, title: string) {
    if (!me) return;
    try {
      await rsvp(eventId, me);
      toast(`You're in: ${title}`);
      track('event_im_in', { from: 'home' });
      enableArrivalWatch();
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function onShare(eventId: number) {
    try {
      await shareEvent(eventId);
      toast('Shared with your circle');
      track('event_shared', { from: 'home' });
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  const updatePin = (next: FeedPin) => setFeed((f) => (f ? { ...f, pins: f.pins.map((p) => (p.id === next.id ? next : p)) } : f));
  const isNew = feed ? feed.circle_count === 0 : false;
  const items = feed ? buildFeed(feed) : [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.space[4], gap: t.space[4], paddingBottom: t.space[8], width: '100%', maxWidth: 640, alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}>
      <PeopleRow
        me={{ name: profile?.display_name ?? 'You', avatarUrl: profile?.avatar_url ?? null }}
        people={feed?.people ?? []}
        outTonight={!!feed?.me.out_tonight}
      />

      {feed?.date_mode?.status === 'active' ? <DateStrip mode={feed.date_mode} dates={[]} /> : null}
      {feed && feed.dates_waiting > 0 && feed.date_mode?.status !== 'active' ? (
        <Card accent="primary" onPress={() => router.push('/messages')} accessibilityLabel="Date requests waiting. Open Messages">
          <AppText weight="bold">
            {feed.dates_waiting} date request{feed.dates_waiting === 1 ? '' : 's'} waiting on you
          </AppText>
        </Card>
      ) : null}

      {isNew ? <FirstFriendsCard /> : null}

      <Segmented<HomeScope>
        options={[
          { key: 'friends', label: 'Friends' },
          { key: 'everyone', label: 'Everyone' },
        ]}
        value={scope ?? 'friends'}
        onChange={changeScope}
      />

      {error && !feed ? (
        <EmptyState glyph="warning" title="Couldn’t load Home" body="Pull down to try again." />
      ) : !feed ? (
        <LoadingList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          glyph="spark"
          title={scope === 'friends' ? 'Quiet in your circle' : 'Nothing here yet'}
          body={scope === 'friends' ? 'Be the first to post, or see what everyone’s sharing.' : 'Be the first to post something.'}
          action={scope === 'friends' ? { label: 'See Everyone', onPress: () => changeScope('everyone') } : { label: 'Post', onPress: () => router.push('/pins/new') }}
        />
      ) : (
        <View style={{ gap: t.space[4] }}>
          {items.map((it) =>
            it.type === 'pin' ? (
              <PinCard key={it.key} pin={it.pin} onChange={updatePin} />
            ) : it.type === 'live' ? (
              <LiveCard key={it.key} group={it.group} />
            ) : it.type === 'event' ? (
              <EventFeedCard key={it.key} event={it.event} onIn={() => onIn(it.event.id, it.event.title)} onShare={() => onShare(it.event.id)} />
            ) : it.type === 'connection' ? (
              <NewConnectionCard key={it.key} person={it.person} />
            ) : (
              <PlacementCard key={it.key} place={it.place} />
            ),
          )}
        </View>
      )}
    </ScrollView>
  );
}
