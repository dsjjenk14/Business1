import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { RadiusControl } from '@/components/pins/RadiusControl';
import { EmptyCard, EventCard, GoingOutPersonRow, MyNightOut } from '@/components/tonight/GoingOutList';
import { AppText, Button, Card, Chip, IconButton, LoadingList, Section, Segmented, useToast } from '@/components/ui';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { preciseLocation } from '@/features/circles/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import {
  fetchCompany,
  fetchGoingOut,
  imHere,
  joinGoingOut,
  rsvp,
  setHereAudience,
  type Company,
  VIBES,
  type FeedEvent,
  type FeedPerson,
  type GoingOutFeed,
} from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { DEFAULT_RADIUS_MI, SEARCH_RADIUS_MI } from '@/lib/radius';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

type Tab = 'tonight' | 'weekend';

/** Tonight: who's going out and what's happening, tonight and this weekend. (Groups live in Circles.) */
export default function Tonight() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { location } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;

  const [tab, setTab] = useState<Tab>('tonight');
  const [feed, setFeed] = useState<GoingOutFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [company, setCompany] = useState<Company[]>([]);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const [radius, setRadius] = useState(DEFAULT_RADIUS_MI);
  const [effectiveRadius, setEffectiveRadius] = useState(DEFAULT_RADIUS_MI);
  const [vibe, setVibe] = useState<string | null>(null);
  const weekend = tab === 'weekend';

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const f = await fetchGoingOut(tab, { lat, lng, radiusMi: effectiveRadius });
      if (id !== requestId.current) return;
      setFeed(f);
      const mineNow = f.people.find((p) => p.is_me);
      setMinutesLeft(mineNow?.live_until ? Math.round((new Date(mineNow.live_until).getTime() - Date.now()) / 60000) : null);
      setCompany(mineNow ? await fetchCompany(mineNow.post_id).catch(() => []) : []);
      setError(null);
    } catch {
      if (id === requestId.current) setError("Couldn't load. Pull down to try again.");
    }
  }, [tab, effectiveRadius, lat, lng]);

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

  function changeTab(next: Tab) {
    setFeed(null);
    setTab(next);
  }

  async function onRsvp(e: FeedEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're in: ${e.title}`);
      enableArrivalWatch();
      load();
    } catch (err) {
      // Ticketed event: go to the event page to buy a ticket.
      if (/ticketed/i.test(friendlyError(err))) router.push({ pathname: '/events/[id]', params: { id: String(e.id) } });
      else toast(friendlyError(err));
    }
  }

  const people = (feed?.people ?? []).filter((p) => !p.is_me && (!vibe || (p.vibes ?? []).includes(vibe)));
  const mine = feed?.people.find((p) => p.is_me);
  const editMine = () => router.push({ pathname: '/tonight/post', params: mine ? { when: mine.when_kind } : {} });

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const audienceLabel = (a: string | null | undefined) => (a === 'network' ? 'your network' : a === 'custom' ? 'the people you picked' : 'your circle');
  const onIn = () =>
    act(async () => imHere(await preciseLocation().catch(() => location)), `Marked you there. Only ${audienceLabel(mine?.here_audience)} can see it.`);
  const onAudience = (a: 'circle' | 'network' | 'custom') =>
    a === 'custom'
      ? editMine()
      : mine
        ? act(() => setHereAudience(mine.post_id, a), a === 'network' ? 'Your network can see when you’re there' : 'Only your circle can see when you’re there')
        : undefined;
  const onJoin = (p: FeedPerson, status: 'heading' | null) =>
    act(() => joinGoingOut(p.post_id, status), status ? `${p.display_name.split(' ')[0]} knows you’re in` : 'Cancelled');

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.space[4], gap: t.space[4], paddingBottom: t.space[8] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <AppText variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
          Tonight
        </AppText>
        <IconButton icon="sparkles-outline" label="Tonight for You, an AI pick" onPress={() => router.push('/tonight/for-you')} />
        <IconButton icon="map-outline" label="Map of who's out" onPress={() => router.push({ pathname: '/tonight/map', params: { when: weekend ? 'weekend' : 'tonight' } })} />
        <Button label="Make plans" size="md" onPress={() => router.push({ pathname: '/tonight/post', params: { when: weekend ? 'weekend' : 'tonight' } })} />
      </View>

      <RadiusControl
        label="Search radius"
        value={radius}
        onChange={setRadius}
        onCommit={setEffectiveRadius}
        max={SEARCH_RADIUS_MI}
        planMax={SEARCH_RADIUS_MI}
        premiumMax={null}
      />

      <Segmented<Tab>
        options={[
          { key: 'tonight', label: 'Tonight' },
          { key: 'weekend', label: 'This Weekend' },
        ]}
        value={tab}
        onChange={changeTab}
      />

      {/* Filter people by what they're up to (dinner, drinks, music…). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
        <Chip label="All" selected={vibe === null} onPress={() => setVibe(null)} />
        {VIBES.map((v) => (
          <Chip key={v.key} label={v.label} glyph={v.glyph} selected={vibe === v.key} onPress={() => setVibe(vibe === v.key ? null : v.key)} />
        ))}
      </ScrollView>

      {error ? (
        <AppText tone="danger" align="center">
          {error}
        </AppText>
      ) : null}

      {!feed ? (
        <LoadingList />
      ) : (
        <>
          {mine && !weekend ? (
            <MyNightOut me={mine} company={company} minutesLeft={minutesLeft} busy={busy} onIn={onIn} onEdit={editMine} onAudience={onAudience} />
          ) : mine ? (
            <Card accent="primary">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">Your weekend plans</AppText>
                  <AppText variant="small" tone="muted">
                    {[mine.place, dayTime(mine.starts_at)].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                <Button label="Edit" size="md" variant="secondary" onPress={editMine} />
              </View>
            </Card>
          ) : null}
          <Section title={weekend ? 'Going out this weekend' : 'Going out tonight'}>
            {people.length ? (
              people.map((p) => <GoingOutPersonRow key={p.post_id} person={p} weekend={weekend} onJoin={onJoin} />)
            ) : (
              <AppText variant="small" tone="muted">
                {weekend
                  ? `Nobody within ${feed.radius_mi} mi has made weekend plans yet. Make some and see who’s in.`
                  : `Nobody within ${feed.radius_mi} mi has made plans tonight yet. Make some and see who’s in.`}
              </AppText>
            )}
          </Section>
          {!mine ? (
            <Button
              label={weekend ? 'Make weekend plans' : 'Make plans tonight'}
              variant="secondary"
              onPress={() => router.push({ pathname: '/tonight/post', params: { when: weekend ? 'weekend' : 'tonight' } })}
            />
          ) : null}

          <Section title={weekend ? 'Weekend events' : 'Events tonight'} action={{ label: 'Host an event', onPress: () => router.push('/events/new') }}>
            {feed.events.length ? (
              <View style={{ gap: t.space[3] }}>
                {feed.events.map((e) => (
                  <EventCard key={e.id} event={e} weekend={weekend} onRsvp={onRsvp} />
                ))}
              </View>
            ) : (
              <EmptyCard
                title={weekend ? 'No weekend events nearby yet' : 'No events nearby tonight'}
                body="Host a dinner, a run, a show night. Your circle and network see it first."
                action={{ label: 'Host an event', onPress: () => router.push('/events/new') }}
              />
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}
