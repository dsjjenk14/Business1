import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { EventRow } from '@/components/home/HomeParts';
import { AppText, Section, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { fetchNewcomerEvents, type NewcomerEvent } from '@/features/events/api';
import type { HomeEvent } from '@/features/home/api';
import { rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const asHomeEvent = (e: NewcomerEvent): HomeEvent => ({
  id: e.id,
  title: e.title,
  emoji: e.emoji,
  cover_url: e.cover_url,
  starts_at: e.starts_at,
  place: e.place,
  group_name: null,
  host_id: '',
  host_name: e.host_name,
  host_avatar: null,
  capacity: null,
  ticket_price_cents: null,
  going_count: e.going_count,
  friends_going: 0,
  i_am_going: false,
});

/**
 * For people still finding their people: public events this week where you
 * don't need to know anyone. "New faces welcome" events come first.
 */
export function NewcomerEvents() {
  const t = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [events, setEvents] = useState<NewcomerEvent[]>([]);

  const load = useCallback(() => {
    fetchNewcomerEvents(4)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);
  useFocusEffect(load);

  async function onIn(e: NewcomerEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're in: ${e.title}`);
      track('event_im_in', { from: 'newcomers' });
      enableArrivalWatch();
      load();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  if (!events.length) return null;
  return (
    <Section title="Go without knowing anyone">
      <AppText variant="caption" tone="subtle">
        Open to everyone this week. Say I&apos;m In, show up, and meet people you can vouch for.
      </AppText>
      <View style={{ gap: t.space[1] }}>
        {events.map((e) => (
          <EventRow key={e.id} event={asHomeEvent(e)} subtitle={e.newcomers ? 'New faces welcome' : null} onIn={() => onIn(e)} />
        ))}
      </View>
    </Section>
  );
}
