import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { GroupsList } from '@/components/groups/GroupsList';
import { RadiusControl } from '@/components/pins/RadiusControl';
import { EmptyCard, EventCard, GoingOutPersonRow } from '@/components/tonight/GoingOutList';
import { AppText, Badge, Button, Card, GlyphTile, IconButton, Section, Segmented, useToast } from '@/components/ui';
import { fetchGroups, type GroupsOverview } from '@/features/circles/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { usePlan } from '@/features/plan/usePlan';
import { fetchGoingOut, fetchMyGroupEvents, rsvp, type FeedEvent, type GoingOutFeed, type GroupEvent } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

type Tab = 'tonight' | 'weekend' | 'groups';
const TONIGHT_MAX_MI = 75;

/** Tonight: who's going out and what's happening, tonight and this weekend, plus your groups. */
export default function Tonight() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { limit, premiumLimit } = usePlan();
  const { location } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;

  const [tab, setTab] = useState<Tab>('tonight');
  const [radius, setRadius] = useState(10);
  const [committedRadius, setCommittedRadius] = useState(10);
  const [feed, setFeed] = useState<GoingOutFeed | null>(null);
  const [groups, setGroups] = useState<GroupsOverview | null>(null);
  const [groupEvents, setGroupEvents] = useState<GroupEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const planMax = Math.min(TONIGHT_MAX_MI, limit('search_radius_mi') ?? TONIGHT_MAX_MI);
  const effectiveRadius = Math.min(committedRadius, planMax);
  const weekend = tab === 'weekend';

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      if (tab === 'groups') {
        const [g, ev] = await Promise.all([fetchGroups(), fetchMyGroupEvents()]);
        if (id !== requestId.current) return;
        setGroups(g);
        setGroupEvents(ev);
      } else {
        const f = await fetchGoingOut(tab, { lat, lng, radiusMi: effectiveRadius });
        if (id !== requestId.current) return;
        setFeed(f);
      }
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

  async function onRsvp(e: FeedEvent | GroupEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're going to ${e.title}`);
      load();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  const people = feed?.people ?? [];
  const mine = people.find((p) => p.is_me);
  const editMine = () => router.push({ pathname: '/tonight/post', params: mine ? { when: mine.when_kind } : {} });

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.space[4], gap: t.space[4], paddingBottom: t.space[8] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <AppText variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
          Tonight
        </AppText>
        <IconButton icon="map-outline" label="Map of who's out" onPress={() => router.push({ pathname: '/tonight/map', params: { when: weekend ? 'weekend' : 'tonight' } })} />
        <Button label="+ Going Out" size="md" onPress={() => router.push({ pathname: '/tonight/post', params: { when: weekend ? 'weekend' : 'tonight' } })} />
      </View>

      {tab !== 'groups' ? (
        <RadiusControl
          label="Search radius"
          value={Math.min(radius, planMax)}
          onChange={setRadius}
          onCommit={setCommittedRadius}
          max={TONIGHT_MAX_MI}
          planMax={planMax}
          premiumMax={premiumLimit('search_radius_mi')}
        />
      ) : null}

      <Segmented<Tab>
        options={[
          { key: 'tonight', label: 'Tonight' },
          { key: 'weekend', label: 'This Weekend' },
          { key: 'groups', label: 'Groups' },
        ]}
        value={tab}
        onChange={changeTab}
      />

      {error ? (
        <AppText tone="danger" align="center">
          {error}
        </AppText>
      ) : null}

      {tab === 'groups' ? (
        groups ? (
          <>
            {groupEvents.length ? (
              <Section title="Coming up in your groups">
                {groupEvents.map((e) => (
                  <Card key={e.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={`${e.title}, ${e.group_name}`}
                        onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(e.id) } })}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                        <GlyphTile name={e.emoji ?? 'calendar'} size={40} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="small" weight="bold">
                            {e.title}
                          </AppText>
                          <AppText variant="caption" tone="subtle">
                            {[e.group_name, dayTime(e.starts_at), e.venue_name, `${e.going_count} going`].filter(Boolean).join(' · ')}
                          </AppText>
                        </View>
                      </Pressable>
                      {e.i_am_going ? <Badge label="Going" tone="trust" /> : <Button label="RSVP" size="md" onPress={() => onRsvp(e)} />}
                    </View>
                  </Card>
                ))}
              </Section>
            ) : null}
            <GroupsList groups={groups} onChange={setGroups} />
          </>
        ) : (
          <AppText tone="subtle" align="center">
            Loading…
          </AppText>
        )
      ) : !feed ? (
        <AppText tone="subtle" align="center">
          Loading…
        </AppText>
      ) : (
        <>
          <Section title={weekend ? 'Going out this weekend' : 'Going out tonight'}>
            {people.length ? (
              people.map((p) => <GoingOutPersonRow key={p.post_id} person={p} weekend={weekend} onEditMine={editMine} />)
            ) : (
              <AppText variant="small" tone="muted">
                {weekend
                  ? `Nobody within ${feed.radius_mi} mi has posted weekend plans yet. Be the first.`
                  : `Nobody within ${feed.radius_mi} mi has said they're going out tonight yet. Be the first.`}
              </AppText>
            )}
          </Section>
          {!mine ? (
            <Button
              label={weekend ? "I'm going out this weekend" : "I'm going out tonight"}
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
