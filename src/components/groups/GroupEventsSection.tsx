import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Badge, Button, Card, GlyphTile, Section, useToast } from '@/components/ui';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { fetchMyGroupEvents, rsvp, type GroupEvent } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** "Coming up in your groups": the next events in groups you're in, with I'm In. */
export function GroupEventsSection() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [events, setEvents] = useState<GroupEvent[]>([]);

  const load = useCallback(() => {
    fetchMyGroupEvents()
      .then(setEvents)
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);

  async function onRsvp(e: GroupEvent) {
    if (!me) return;
    try {
      await rsvp(e.id, me);
      toast(`You're in: ${e.title}`);
      enableArrivalWatch();
      load();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  if (!events.length) return null;
  return (
    <Section title="Coming up in your groups">
      {events.map((e) => (
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
            {e.i_am_going ? <Badge label="You're in" glyph="check" tone="trust" /> : <Button label="I'm In" size="md" onPress={() => onRsvp(e)} />}
          </View>
        </Card>
      ))}
    </Section>
  );
}
