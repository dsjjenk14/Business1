import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Button, Card, GlyphTile, GlyphTitle, Screen, Section, useToast } from '@/components/ui';
import { preciseLocation } from '@/features/circles/api';
import { checkInOpen, eventCheckIn, eventPhase, fetchEvent, type EventDetail } from '@/features/events/api';
import { cancelRsvp, rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { clockTime, dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** An event: who's hosting, who's going, RSVP, check in when you're there, then recap and vouch. */
export default function EventScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEvent(await fetchEvent(Number(id)));
    } catch {
      setEvent(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (event === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Event" />
        <Screen>
          <AppText tone="subtle" align="center">
            Loading…
          </AppText>
        </Screen>
      </View>
    );
  }
  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Event" />
        <Screen>
          <AppText tone="muted" align="center">
            This event isn&apos;t available.
          </AppText>
        </Screen>
      </View>
    );
  }

  const phase = eventPhase(event);
  const spotsLeft = event.capacity != null ? Math.max(0, event.capacity - event.going_count) : null;
  const canCheckIn = event.i_am_going && checkInOpen(event);

  async function toggleRsvp() {
    if (!me || !event) return;
    setBusy(true);
    try {
      if (event.i_am_going) {
        await cancelRsvp(event.id, me);
        toast("You're no longer going");
      } else {
        await rsvp(event.id, me);
        toast(`You're going to ${event.title}`);
      }
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!event) return;
    setBusy(true);
    try {
      const loc = await preciseLocation();
      const met = await eventCheckIn(event.id, loc);
      if (met.length) {
        toast(`Checked in. You met ${met.length} ${met.length === 1 ? 'person' : 'people'} here.`);
        router.push('/circles/vouch');
      } else {
        toast("Checked in. When others check in too, you'll be able to vouch for each other.");
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Event" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <GlyphTile name={event.emoji ?? 'calendar'} size={64} />
          <AppText variant="h2" align="center" accessibilityRole="header">
            {event.title}
          </AppText>
          <AppText tone="muted" align="center">
            {dayTime(event.starts_at)}
            {event.ends_at ? ` – ${clockTime(event.ends_at)}` : ''}
          </AppText>
          {event.venue ? (
            <AppText
              tone="primary"
              weight="bold"
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(event.venue?.id) } })}>
              {event.venue.name}
              {event.venue.neighborhood ? ` · ${event.venue.neighborhood}` : ''}
            </AppText>
          ) : event.place ? (
            <AppText tone="muted">{event.place}</AppText>
          ) : null}
          {event.group ? (
            <AppText
              variant="small"
              tone="muted"
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(event.group?.id) } })}>
              {event.group.name}
            </AppText>
          ) : null}
        </View>

        {event.description ? <AppText>{event.description}</AppText> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
          <Badge label={`${event.going_count} going`} tone="neutral" />
          {spotsLeft != null ? <Badge label={spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`} tone={spotsLeft === 0 ? 'primary' : 'trust'} /> : null}
          {phase === 'live' ? <Badge label="Happening now" tone="primary" /> : phase === 'ended' ? <Badge label="Ended" tone="neutral" /> : null}
        </View>

        {phase !== 'ended' ? (
          event.is_host ? (
            <AppText variant="small" tone="muted" align="center">
              You&apos;re hosting.
            </AppText>
          ) : (
            <Button
              label={event.i_am_going ? "Can't make it" : spotsLeft === 0 ? 'Full' : 'RSVP'}
              variant={event.i_am_going ? 'secondary' : 'primary'}
              onPress={toggleRsvp}
              loading={busy}
              disabled={!event.i_am_going && spotsLeft === 0}
            />
          )
        ) : null}

        {canCheckIn ? (
          <Card accent="trust">
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph="arrive" tone="trust">At the event?</GlyphTitle>
              <AppText variant="small" tone="muted">
                Check in with GPS. Anyone else who checks in here counts as a real-life meetup, and you can vouch for each other.
              </AppText>
              <Button label="Check in here" variant="trust" size="md" onPress={checkIn} loading={busy} />
            </View>
          </Card>
        ) : null}

        {phase === 'ended' && event.i_am_going ? (
          <Card accent="primary">
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph="party">How was it?</GlyphTitle>
              <AppText variant="small" tone="muted">
                Drop a recap pin with photos and tag who was there. Then vouch for people you met.
              </AppText>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                {event.has_recap ? (
                  <Badge label="Recap posted" tone="trust" />
                ) : (
                  <Button
                    label="Post a recap"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: '/events/[id]/recap', params: { id: String(event.id) } })}
                  />
                )}
                <Button label="Vouch" size="md" variant="trust" style={{ flex: 1 }} onPress={() => router.push('/circles/vouch')} />
              </View>
            </View>
          </Card>
        ) : null}

        <Section title="Hosted by">
          <PersonRow id={event.host.id} name={event.host.display_name} avatarUrl={event.host.avatar_url} vouches={event.host.vouch_count} />
        </Section>

        <Section title={`Going (${event.going_count})`}>
          {event.going.map((p) => (
            <PersonRow
              key={p.id}
              id={p.id}
              name={p.id === me ? 'You' : p.display_name}
              avatarUrl={p.avatar_url}
              ring={p.degree === 1 ? 'trust' : p.degree === 2 ? 'ai' : null}
              detail={p.degree === 1 ? 'Your circle' : p.degree === 2 ? 'Your network' : null}
            />
          ))}
        </Section>
      </Screen>
    </View>
  );
}
