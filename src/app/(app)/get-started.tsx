import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { EventRow, GroupSuggestion } from '@/components/home/HomeParts';
import { AppText, Button, LoadingList, Screen, Section, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { fetchHomeFeed, type HomeEvent, type SuggestedGroup } from '@/features/home/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { rsvp } from '@/features/tonight/api';
import { fetchWhatsIn } from '@/features/trending/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * The first 5 minutes: right after the welcome tour, find your people. Join a
 * group or two and say I'm In to something coming up, so the app has people
 * and plans in it from day one.
 */
export default function GetStarted() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { then } = useLocalSearchParams<{ then?: string }>();
  const { location } = useApproxLocation();
  const [groups, setGroups] = useState<SuggestedGroup[] | null>(null);
  const [events, setEvents] = useState<HomeEvent[] | null>(null);
  const [joined, setJoined] = useState(0);

  const load = useCallback(async () => {
    try {
      const [feed, whats] = await Promise.all([fetchHomeFeed(location), fetchWhatsIn(location?.lat, location?.lng).catch(() => null)]);
      setGroups(feed.suggested_groups ?? []);
      // Events near you first; if none, what's trending.
      const near = feed.nearby_events ?? [];
      setEvents((near.length ? near : (whats?.events ?? [])).filter((e) => !e.i_am_going).slice(0, 5));
    } catch {
      setGroups([]);
      setEvents([]);
    }
  }, [location]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onIn(e: HomeEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're in: ${e.title}`);
      track('event_im_in', { from: 'get_started' });
      enableArrivalWatch();
      setJoined((n) => n + 1);
      setEvents((list) => (list ? list.filter((x) => x.id !== e.id) : list));
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  function done() {
    track('get_started_done', { joined });
    if (then === 'checklist') router.replace('/checklist');
    else router.replace('/');
  }

  return (
    <Screen safeTop contentGap={t.space[6]}>
      <View style={{ gap: t.space[2] }}>
        <AppText variant="h1" accessibilityRole="header">
          Find your people
        </AppText>
        <AppText tone="muted">Join a group or say I&apos;m In to something coming up. That&apos;s how your Insiders start.</AppText>
      </View>

      <Section title="Groups in your area">
        {groups === null ? (
          <LoadingList rows={3} />
        ) : groups.length === 0 ? (
          <AppText variant="small" tone="muted">
            No groups near you yet. You can start one from the Insiders tab.
          </AppText>
        ) : (
          groups.map((g) => (
            <GroupSuggestion
              key={g.id}
              group={g}
              onJoined={() => {
                setJoined((n) => n + 1);
                setGroups((list) => (list ? list.filter((x) => x.id !== g.id) : list));
              }}
            />
          ))
        )}
      </Section>

      <Section title="Coming up">
        {events === null ? (
          <LoadingList rows={3} />
        ) : events.length === 0 ? (
          <AppText variant="small" tone="muted">
            Nothing coming up near you yet. Check What&apos;s In later.
          </AppText>
        ) : (
          events.map((e) => <EventRow key={e.id} event={e} subtitle={e.group_name} onIn={() => onIn(e)} />)
        )}
      </Section>

      <Button label={joined ? 'Done' : 'Skip for now'} variant={joined ? 'primary' : 'secondary'} onPress={done} />
    </Screen>
  );
}
