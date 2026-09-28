import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { ActivityRow, EventRow, GroupSuggestion } from '@/components/home/HomeParts';
import { LiveNowRow } from '@/components/live/LiveNowRow';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Button, Card, EmptyState, LoadingList, Section, Stamp, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { cacheHome, fetchHomeFeed, readCachedHome, type HomeEvent, type HomeFeed } from '@/features/home/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import { welcomeSeen } from '@/features/onboarding/welcome';
import type { FeedPin } from '@/features/pins/api';
import { rsvp } from '@/features/tonight/api';
import { fetchWhatsIn } from '@/features/trending/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const PINS_SHOWN = 5;

/**
 * Home, four things only:
 * your friends' pins, the likes and replies people sent you,
 * your group events, and events your friends are hosting.
 * Opens instantly from the last saved copy, then refreshes.
 */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { location } = useApproxLocation();
  const { dismissed } = useFirstWeekChecklist();
  const shownChecklist = useRef(false);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  // What's In: the top trending events, right on Home.
  const [trending, setTrending] = useState<HomeEvent[]>([]);
  const [morePins, setMorePins] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // First time on this phone: the welcome tour, then the first-week checklist
  // (until it's dismissed).
  useEffect(() => {
    if (!me || dismissed === null || shownChecklist.current) return;
    shownChecklist.current = true;
    welcomeSeen(me).then((seen) => {
      if (!seen) router.push({ pathname: '/welcome', params: dismissed === false ? { then: 'checklist' } : {} });
      else if (dismissed === false) router.push('/checklist');
    });
  }, [me, dismissed, router]);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const [next, w] = await Promise.all([fetchHomeFeed(location), fetchWhatsIn(location?.lat, location?.lng).catch(() => null)]);
      setFeed(next);
      if (w) setTrending(w.events.slice(0, 3));
      setError(false);
      cacheHome(me, next);
    } catch {
      setError(true);
    }
  }, [me, location]);

  // Show the saved copy right away, then refresh.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    readCachedHome(me).then((cached) => {
      if (!cancelled && cached?.activity) setFeed((f) => f ?? cached);
    });
    track('home_opened');
    return () => {
      cancelled = true;
    };
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onIn(e: HomeEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're in: ${e.title}`);
      track('event_im_in', { from: 'home' });
      enableArrivalWatch();
      load();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  const updatePin = (next: FeedPin) => setFeed((f) => (f ? { ...f, pins: f.pins.map((p) => (p.id === next.id ? next : p)) } : f));
  const updateEveryonePin = (next: FeedPin) =>
    setFeed((f) => (f ? { ...f, everyone_pins: f.everyone_pins.map((p) => (p.id === next.id ? next : p)) } : f));

  if (!feed) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.space[4], gap: t.space[4] }}>
        {error ? <EmptyState glyph="warning" title="Couldn’t load Home" body="Pull down to try again." /> : <LoadingList rows={5} />}
      </ScrollView>
    );
  }

  const pins = morePins ? feed.pins : feed.pins.slice(0, PINS_SHOWN);

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.space[4], gap: t.space[6], paddingBottom: t.space[8], width: '100%', maxWidth: 640, alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}>
      <LiveNowRow />

      <View style={{ borderRadius: t.radius.lg, backgroundColor: t.colors.surface, borderLeftWidth: 3, borderColor: t.colors.primary, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="What's In: trending events, hot spots and posts near you"
          onPress={() => router.push('/whats-in')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], padding: t.space[4] }}>
          <Ionicons name="flame" size={26} color={t.colors.primaryText} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="h2">What&apos;s In</AppText>
            <Stamp>Trending events · hot spots · posts</Stamp>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.colors.textSubtle} />
        </Pressable>
        {trending.length ? (
          <View style={{ paddingHorizontal: t.space[4], paddingBottom: t.space[3], gap: t.space[2] }}>
            {trending.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                subtitle="Trending"
                onIn={() => onIn(e)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* 1. Your friends' pins */}
      <Section title="Your friends’ pins" action={{ label: 'Post', onPress: () => router.push('/pins/new') }}>
        {feed.pins.length === 0 ? (
          <Card>
            <View style={{ gap: t.space[2] }}>
              <AppText variant="small" tone="muted">
                {feed.friend_count === 0
                  ? 'Add friends to see their pins here. Scan each other’s code when you’re together, or send a code to someone you know.'
                  : 'Your friends haven’t posted lately. Post something to get it going.'}
              </AppText>
              <Button
                label={feed.friend_count === 0 ? 'Add someone' : 'Post a pin'}
                size="md"
                variant="secondary"
                onPress={() => router.push(feed.friend_count === 0 ? '/connect' : '/pins/new')}
              />
            </View>
          </Card>
        ) : (
          <View style={{ gap: t.space[3] }}>
            {pins.map((p) => (
              <PinCard key={p.id} pin={p} onChange={updatePin} />
            ))}
            {!morePins && feed.pins.length > PINS_SHOWN ? (
              <Button label={`Show ${feed.pins.length - PINS_SHOWN} more`} size="md" variant="secondary" onPress={() => setMorePins(true)} />
            ) : null}
          </View>
        )}
      </Section>

      {/* New members: something to do until friends arrive. */}
      {feed.everyone_pins?.length ? (
        <Section title="Popular on I’m In" action={{ label: 'More', onPress: () => router.push('/pins') }}>
          <View style={{ gap: t.space[3] }}>
            {feed.everyone_pins.slice(0, 3).map((p) => (
              <PinCard key={p.id} pin={p} onChange={updateEveryonePin} />
            ))}
          </View>
        </Section>
      ) : null}
      {feed.suggested_groups?.length ? (
        <Section title="Groups to join" action={{ label: 'All groups', onPress: () => router.push({ pathname: '/circles', params: { tab: 'groups' } }) }}>
          <Card>
            <View style={{ gap: t.space[2] }}>
              {feed.suggested_groups.map((g) => (
                <GroupSuggestion key={g.id} group={g} onJoined={load} />
              ))}
            </View>
          </Card>
        </Section>
      ) : null}
      {feed.nearby_events?.length ? (
        <Section title="Events near you">
          <Card>
            <View style={{ gap: t.space[2] }}>
              {feed.nearby_events.map((e) => (
                <EventRow key={e.id} event={e} subtitle={`${e.host_name.split(' ')[0]} is hosting`} onIn={() => onIn(e)} />
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {/* 2. Likes and replies people sent you */}
      <Section title="Likes and replies">
        {feed.activity.length === 0 ? (
          <AppText variant="small" tone="muted">
            When people like or reply to your pins, you&apos;ll see it here.
          </AppText>
        ) : (
          <Card>
            <View style={{ gap: t.space[1] }}>
              {feed.activity.map((a) => (
                <ActivityRow key={`${a.kind}-${a.pin_id}-${a.at}-${a.actor_id}`} item={a} />
              ))}
            </View>
          </Card>
        )}
      </Section>

      {/* 3. Your group events */}
      <Section title="Your group events" action={{ label: 'Groups', onPress: () => router.push({ pathname: '/circles', params: { tab: 'groups' } }) }}>
        {feed.group_events.length === 0 ? (
          <AppText variant="small" tone="muted">
            No upcoming events in your groups.
          </AppText>
        ) : (
          <Card>
            <View style={{ gap: t.space[2] }}>
              {feed.group_events.map((e) => (
                <EventRow key={e.id} event={e} subtitle={e.group_name} onIn={() => onIn(e)} />
              ))}
            </View>
          </Card>
        )}
      </Section>

      {/* 4. Events your friends are hosting */}
      <Section title="Hosted by friends">
        {feed.friends_hosting.length === 0 ? (
          <AppText variant="small" tone="muted">
            None of your friends are hosting anything right now.
          </AppText>
        ) : (
          <Card>
            <View style={{ gap: t.space[2] }}>
              {feed.friends_hosting.map((e) => (
                <EventRow key={e.id} event={e} subtitle={`${e.host_name.split(' ')[0]} is hosting`} onIn={() => onIn(e)} />
              ))}
            </View>
          </Card>
        )}
      </Section>
    </ScrollView>
  );
}
