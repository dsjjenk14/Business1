import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { useAppConfig } from '@/config/useAppConfig';
import { AppText, Badge, Button, Card, EmptyState, GlyphTile, GlyphTitle, LoadingDetail, Screen, Section, Stars, StarsInput, TextField, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { preciseLocation } from '@/features/circles/api';
import { shareEvent } from '@/features/home/api';
import { checkInOpen, eventCheckIn, eventPhase, fetchEvent, joinWaitlist, leaveWaitlist, type EventDetail } from '@/features/events/api';
import { fetchTicketHolders, money, openPayment, parsePrice, refundTicket, setTicketPrice, ticketSplit, type TicketHolder } from '@/features/payments/api';
import { fetchEventRating, rateVenue, type EventRating } from '@/features/ratings/api';
import { cancelRsvp, rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { clockTime, dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** An event: who's hosting, who's going, I'm In, marked there by GPS on arrival, then recap and vouch. */
export default function EventScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  // Back from paying: the ticket appears once Stripe confirms (a few seconds).
  useEffect(() => {
    if (paid !== '1') return;
    toast('Payment received. Your ticket shows here in a moment.');
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [paid, load, toast]);

  if (event === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Event" />
        <Screen>
          <LoadingDetail />
        </Screen>
      </View>
    );
  }
  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Event" />
        <Screen>
          <EmptyState glyph="calendar" title="This event isn’t available" body="It may have been cancelled, or it’s only for a group you’re not in." />
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
        toast(`You're in: ${event.title}`);
        enableArrivalWatch();
      }
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function buyTicket() {
    if (!event) return;
    setBusy(true);
    try {
      track('ticket_checkout_opened');
      await openPayment('ticket', event.id);
      await load();
      // Stripe confirms the payment a moment later.
      setTimeout(load, 4000);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payments aren’t available right now.');
    } finally {
      setBusy(false);
    }
  }

  async function waitlist(join: boolean) {
    if (!event) return;
    setBusy(true);
    try {
      if (join) {
        const pos = await joinWaitlist(event.id);
        toast(`You're #${pos} on the waitlist`);
        track('waitlist_joined');
      } else {
        await leaveWaitlist(event.id);
        toast('You left the waitlist');
      }
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!event) return;
    setSharing(true);
    try {
      await shareEvent(event.id);
      toast('Shared with your circle');
      track('event_shared', { from: 'event' });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setSharing(false);
    }
  }

  async function checkIn() {
    if (!event) return;
    setBusy(true);
    try {
      const loc = await preciseLocation();
      const met = await eventCheckIn(event.id, loc);
      if (met.length) {
        toast(`You're there. You met ${met.length} ${met.length === 1 ? 'person' : 'people'} here.`);
        router.push('/circles/vouch');
      } else {
        toast("You're there. You can post Outs from this event now.");
      }
      await load();
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
          {event.i_am_here ? (
            <Badge label="You're there" glyph="arrive" tone="trust" />
          ) : event.i_am_going && !event.is_host ? (
            <Badge label="You're in" glyph="check" tone="trust" />
          ) : null}
          <Badge label={`${event.going_count} going`} tone="neutral" />
          {spotsLeft != null ? <Badge label={spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`} tone={spotsLeft === 0 ? 'primary' : 'trust'} /> : null}
          {phase === 'live' ? <Badge label="Happening now" tone="primary" /> : phase === 'ended' ? <Badge label="Ended" tone="neutral" /> : null}
        </View>

        {phase !== 'ended' ? (
          event.is_host ? (
            <HostTickets event={event} onChange={load} />
          ) : event.ticket_price_cents != null && !event.i_am_going && spotsLeft !== 0 ? (
            <View style={{ gap: t.space[2] }}>
              <Button label={`Buy Tickets · ${money(event.ticket_price_cents)}`} onPress={buyTicket} loading={busy} />
              <AppText variant="caption" tone="subtle" align="center">
                Paid securely by card through Stripe.
              </AppText>
            </View>
          ) : event.has_ticket ? (
            <View style={{ gap: t.space[1], alignItems: 'center' }}>
              <Badge label="You have a ticket" glyph="check" tone="trust" />
              <AppText variant="caption" tone="subtle" align="center">
                Need a refund? Message the host.
              </AppText>
            </View>
          ) : (
            !event.i_am_going && spotsLeft === 0 ? (
              <View style={{ gap: t.space[2] }}>
                {event.on_waitlist ? (
                  <>
                    <AppText align="center" weight="bold">
                      You&apos;re #{event.waitlist_position} on the waitlist
                    </AppText>
                    <AppText variant="small" tone="muted" align="center">
                      If a spot opens, you&apos;re in automatically and we&apos;ll let you know.
                    </AppText>
                    <Button label="Leave the waitlist" variant="secondary" onPress={() => waitlist(false)} loading={busy} />
                  </>
                ) : (
                  <>
                    <Button label="Join the waitlist" onPress={() => waitlist(true)} loading={busy} />
                    <AppText variant="small" tone="muted" align="center">
                      It&apos;s full{event.waitlist_count ? ` (${event.waitlist_count} waiting)` : ''}. If a spot opens, the next person in line gets it.
                    </AppText>
                  </>
                )}
              </View>
            ) : (
              <Button
                label={event.i_am_going ? "Can't make it" : "I'm In"}
                variant={event.i_am_going ? 'secondary' : 'primary'}
                onPress={toggleRsvp}
                loading={busy}
              />
            )
          )
        ) : null}

        {phase !== 'ended' ? <Button label="Share to my circle" variant="secondary" size="md" onPress={share} loading={sharing} /> : null}

        {canCheckIn && event.i_am_here ? (
          <Card accent="trust">
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph="arrive" tone="trust">You&apos;re there</GlyphTitle>
              <AppText variant="small" tone="muted">
                The app marked you at the event, so you can post Outs from here. Anyone you meet here shows up in Check In; vouching is up to
                you.
              </AppText>
              <Button label="Take an Out" size="md" onPress={() => router.push('/outs/new')} />
              <Button label="Vouch for someone you met" variant="ghost" size="md" onPress={() => router.push('/circles/vouch')} />
            </View>
          </Card>
        ) : canCheckIn ? (
          <Card accent="trust">
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph="arrive" tone="trust">On your way?</GlyphTitle>
              <AppText variant="small" tone="muted">
                {event.venue
                  ? 'When you get there, the app notices from your GPS and marks you there. Keep the app open on arrival.'
                  : 'This event has no mapped place, so tap below when you get there.'}
              </AppText>
              <Button label="I'm here" variant="secondary" size="md" onPress={checkIn} loading={busy} />
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

        {phase !== 'upcoming' ? <RateVenue eventId={event.id} /> : null}

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

/** Host view: sell tickets (price, sales), or set up payouts first. */
/** After an event you went to: rate the place (1–5 stars, optional note). */
function RateVenue({ eventId }: { eventId: number }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<EventRating | null>(null);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchEventRating(eventId)
      .then((r) => {
        setState(r);
        setStars(r?.my_stars ?? 0);
        setNote(r?.my_note ?? '');
      })
      .catch(() => undefined);
  }, [eventId]);

  if (!state?.can_rate || !state.venue_id) return null;

  async function save() {
    setBusy(true);
    try {
      await rateVenue(eventId, stars, note);
      setState((s) => (s ? { ...s, my_stars: stars, my_note: note.trim() || null } : s));
      setEditing(false);
      toast(`Thanks! You rated ${state?.venue_name}`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const openVenue = () => router.push({ pathname: '/venues/[id]', params: { id: String(state.venue_id) } });

  if (state.my_stars && !editing) {
    return (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">You rated {state.venue_name}</AppText>
          <Stars value={state.my_stars} size={18} />
          {state.my_note ? (
            <AppText variant="small" tone="muted">
              &ldquo;{state.my_note}&rdquo;
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label="Change" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(true)} />
            <Button label="See the place" size="md" variant="ghost" onPress={openVenue} />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card accent="sponsored">
      <View style={{ gap: t.space[2] }}>
        <GlyphTitle glyph="star" tone="sponsored">
          {`Rate ${state.venue_name}`}
        </GlyphTitle>
        <AppText variant="small" tone="muted">
          How was the place? Your rating helps people pick where to go.
        </AppText>
        <StarsInput value={stars} onChange={setStars} />
        <TextField label="Anything to add?" optional value={note} onChangeText={setNote} placeholder="Great music, slow bar…" maxLength={280} />
        <Button label="Save rating" size="md" onPress={save} loading={busy} disabled={!stars} />
      </View>
    </Card>
  );
}

/** Host: who has tickets, with a full refund for each. */
function TicketHolders({ eventId, version, onChange }: { eventId: number; version: number; onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [holders, setHolders] = useState<TicketHolder[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    fetchTicketHolders(eventId)
      .then(setHolders)
      .catch(() => undefined);
  }, [eventId, version]);

  async function refund(h: TicketHolder) {
    setBusyId(h.ticket_id);
    try {
      await refundTicket(h.ticket_id);
      toast(`Refunded ${h.display_name}`);
      setHolders((list) => list.map((x) => (x.ticket_id === h.ticket_id ? { ...x, status: 'refunded' } : x)));
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t refund right now.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmRefund(h: TicketHolder) {
    const title = `Refund ${h.display_name}?`;
    const body = `They get ${money(h.amount_cents)} back and come off the list. This can’t be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title} ${body}`)) refund(h);
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refund', style: 'destructive', onPress: () => refund(h) },
    ]);
  }

  if (!holders.length) return null;
  return (
    <View style={{ gap: t.space[1], marginTop: t.space[1] }}>
      <AppText variant="caption" tone="subtle" weight="bold">
        TICKET HOLDERS
      </AppText>
      {holders.map((h) => (
        <View key={h.ticket_id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: 44 }}>
          <AppText style={{ flex: 1 }} numberOfLines={1}>
            {h.display_name}
          </AppText>
          {h.status === 'paid' ? (
            <Button
              label="Refund"
              size="md"
              variant="ghost"
              accessibilityLabel={`Refund ${h.display_name}`}
              loading={busyId === h.ticket_id}
              onPress={() => confirmRefund(h)}
            />
          ) : (
            <AppText variant="small" tone="subtle">
              Refunded
            </AppText>
          )}
        </View>
      ))}
    </View>
  );
}

function HostTickets({ event, onChange }: { event: EventDetail; onChange: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [price, setPrice] = useState(event.ticket_price_cents != null ? String(event.ticket_price_cents / 100) : '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { settings } = useAppConfig();
  const sold = event.tickets_sold ?? 0;
  const feePercent = ticketSplit(0, settings).feePercent;

  async function save(cents: number | null) {
    setBusy(true);
    try {
      await setTicketPrice(event.id, cents);
      toast(cents == null ? 'This event is free now' : `Tickets are ${money(cents)}`);
      setEditing(false);
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (event.ticket_price_cents != null && !editing) {
    return (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">
            Tickets: {money(event.ticket_price_cents)} · {sold} sold
          </AppText>
          <AppText variant="small" tone="muted">
            You get about {money(ticketSplit(event.ticket_price_cents, settings).host)} per ticket, after I&apos;m In&apos;s {feePercent}% and Stripe&apos;s card
            fee ({money(ticketSplit(event.ticket_price_cents, settings).card)}).
          </AppText>
          {sold === 0 ? (
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="Change price" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(true)} />
              <Button label="Make it free" size="md" variant="ghost" onPress={() => save(null)} loading={busy} />
            </View>
          ) : null}
          <TicketHolders eventId={event.id} version={sold} onChange={onChange} />
        </View>
      </Card>
    );
  }

  if (!event.host_can_sell) {
    return (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" tone="muted">
            You&apos;re hosting. Want to sell tickets? Set up payouts first so you can get paid.
          </AppText>
          <Button label="Set up payouts" size="md" variant="secondary" onPress={() => router.push('/settings/payouts')} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Sell tickets</AppText>
        <TextField label="Ticket price ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="25" maxLength={7} />
        <AppText variant="caption" tone="subtle">
          I&apos;m In keeps {feePercent}% of each ticket and Stripe takes its card fee (2.9% + 30¢). The rest goes to you.
          {parsePrice(price) != null ? ` At ${money(parsePrice(price))}, you get about ${money(ticketSplit(parsePrice(price) ?? 0, settings).host)}.` : ''}
        </AppText>
        <Button label="Save price" size="md" onPress={() => save(parsePrice(price))} loading={busy} disabled={parsePrice(price) == null} />
      </View>
    </Card>
  );
}
