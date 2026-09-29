import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { DateTimeChips, upcomingDays } from '@/components/tonight/DateTimeChips';
import { VenuePicker, type PlaceChoice } from '@/components/tonight/VenuePicker';
import { useAppConfig } from '@/config/useAppConfig';
import { AppText, Button, Chip, type GlyphName, isGlyphName, Screen, TextField, useToast } from '@/components/ui';
import { PeoplePicker } from '@/components/chat/PeoplePicker';
import { fetchChatCandidates, type ChatCandidate } from '@/features/chat/api';
import { createEvent, type EventVisibility } from '@/features/events/api';
import { ROOM_KINDS, setEventVirtual, type RoomKind } from '@/features/events/room';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { fetchPayoutStatus, money, parsePrice, setTicketPrice, ticketSplit, type PayoutStatus } from '@/features/payments/api';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { marketDate } from '@/lib/time';
import { useTheme } from '@/theme';

const EVENT_GLYPHS: { glyph: GlyphName; label: string }[] = [
  { glyph: 'dinner', label: 'Dinner' },
  { glyph: 'drinks', label: 'Drinks' },
  { glyph: 'music', label: 'Music' },
  { glyph: 'route', label: 'Run' },
  { glyph: 'fitness', label: 'Workout' },
  { glyph: 'paddle', label: 'Pickleball' },
  { glyph: 'wine', label: 'Wine' },
  { glyph: 'art', label: 'Art' },
  { glyph: 'party', label: 'Party' },
  { glyph: 'coffee', label: 'Coffee' },
];
const DURATIONS = [1, 2, 3, 4, 6];
const CAPACITIES: (number | null)[] = [null, 4, 6, 8, 12, 20];

/** Host an event, on your own or for a group you run. */
export default function NewEvent() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { settings } = useAppConfig();
  const { session } = useAuth();
  const me = session?.user.id;
  const params = useLocalSearchParams<{ group?: string }>();
  const { location } = useApproxLocation();

  const [title, setTitle] = useState('');
  const [glyph, setGlyph] = useState<GlyphName>('dinner');
  const [day, setDay] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [duration, setDuration] = useState(3);
  const [place, setPlace] = useState<PlaceChoice>({ venueId: null, text: '' });
  const [capacity, setCapacity] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [payouts, setPayouts] = useState<PayoutStatus | null>(null);

  useEffect(() => {
    fetchPayoutStatus()
      .then(setPayouts)
      .catch(() => undefined);
  }, []);
  const [description, setDescription] = useState('');
  // Who can see it: public, circle only, or a surprise party hidden from one person.
  const [mode, setMode] = useState<'public' | 'circle' | 'surprise'>('public');
  const [guest, setGuest] = useState<string | null>(null);
  const [circle, setCircle] = useState<ChatCandidate[] | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string; emoji: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(params.group ? Number(params.group) : null);
  const [busy, setBusy] = useState(false);
  // In person, online, or both. Online events are for groups you run.
  const [format, setFormat] = useState<'in_person' | 'virtual' | 'hybrid'>('in_person');
  const [roomKind, setRoomKind] = useState<RoomKind>('video');
  const [joinUrl, setJoinUrl] = useState('');
  const online = format !== 'in_person';
  const linkOk = roomKind !== 'link' || /^https:\/\/\S+$/i.test(joinUrl.trim());

  const days = useMemo(() => upcomingDays(30), []);

  useEffect(() => {
    if (!me) return;
    supabase
      .from('group_members')
      .select('group_id, groups(id, name, emoji)')
      .eq('user_id', me)
      .in('role', ['owner', 'admin'])
      .then(({ data }) => setGroups((data ?? []).flatMap((r) => (r.groups ? [r.groups] : []))));
  }, [me]);

  const startsAt = day && minutes != null ? marketDate(day, minutes) : null;
  const ready = !(mode === 'surprise' && !guest) && title.trim().length >= 2 && !!startsAt && !busy && (!online || (groupId != null && linkOk));

  async function submit() {
    if (!startsAt) return;
    setBusy(true);
    try {
      const id = await createEvent({
        title,
        glyph,
        startsAt,
        durationHours: duration,
        venueId: format === 'virtual' ? null : place.venueId,
        place: format === 'virtual' ? '' : place.text,
        capacity,
        description,
        groupId,
        lat: location?.lat,
        lng: location?.lng,
        visibility: (mode === 'circle' ? 'circle' : 'public') as EventVisibility,
        surpriseFor: mode === 'surprise' ? guest : null,
      });
      if (online) await setEventVirtual(id, format, roomKind, roomKind === 'link' ? joinUrl.trim() : null);
      const cents = payouts?.charges_enabled ? parsePrice(price) : null;
      if (cents != null) {
        try {
          await setTicketPrice(id, cents);
        } catch (e) {
          toast(friendlyError(e));
        }
      }
      toast(groupId ? 'Event posted. Your group has been told.' : cents != null ? `Event posted. Tickets are ${money(cents)}.` : 'Event posted');
      router.replace({ pathname: '/events/[id]', params: { id: String(id) } });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Host an Event" />
      <Screen contentGap={t.space[5]}>
        <TextField label="What is it?" value={title} onChangeText={setTitle} maxLength={100} placeholder="Community dinner, Saturday run, show night…" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {EVENT_GLYPHS.map((e) => (
            <Chip key={e.glyph} label="" glyph={e.glyph} selected={glyph === e.glyph} accessibilityLabel={`Icon: ${e.label}`} onPress={() => setGlyph(e.glyph)} />
          ))}
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            When?
          </AppText>
          <DateTimeChips
            days={days}
            day={day}
            minutes={minutes}
            onChange={(d, m) => {
              setDay(d);
              setMinutes(m);
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], alignItems: 'center' }}>
            <AppText variant="caption" tone="subtle">
              Lasts
            </AppText>
            {DURATIONS.map((h) => (
              <Chip key={h} label={`${h}h`} selected={duration === h} accessibilityLabel={`Lasts ${h} hours`} onPress={() => setDuration(h)} />
            ))}
          </View>
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Where?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Chip label="In person" selected={format === 'in_person'} onPress={() => setFormat('in_person')} />
            <Chip
              label="Online"
              selected={format === 'virtual'}
              onPress={() => {
                setFormat('virtual');
                if (groupId == null && groups[0]) setGroupId(groups[0].id);
              }}
            />
            <Chip
              label="Both"
              selected={format === 'hybrid'}
              onPress={() => {
                setFormat('hybrid');
                if (groupId == null && groups[0]) setGroupId(groups[0].id);
              }}
            />
          </View>
          {online && !groups.length ? (
            <Pressable accessibilityRole="link" onPress={() => router.push('/groups/new')}>
              <AppText variant="small" tone="primary" weight="bold">
                Online events are for groups you run. Start a group →
              </AppText>
            </Pressable>
          ) : null}
          {online && groups.length ? (
            <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
              {ROOM_KINDS.map((k) => {
                const sel = roomKind === k.key;
                return (
                  <Pressable
                    key={k.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    aria-checked={sel}
                    onPress={() => setRoomKind(k.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.space[3],
                      padding: t.space[3],
                      borderRadius: t.radius.md,
                      borderWidth: t.borderWidth.regular,
                      borderColor: sel ? t.colors.primary : t.colors.border,
                      backgroundColor: t.colors.surface,
                    }}>
                    <Ionicons name={k.icon} size={22} color={sel ? t.colors.primaryText : t.colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold">{k.label}</AppText>
                      <AppText variant="small" tone="muted">
                        {k.detail}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
              {roomKind === 'link' ? (
                <TextField
                  label="Link"
                  value={joinUrl}
                  onChangeText={setJoinUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://zoom.us/j/…"
                  hint={joinUrl && !linkOk ? 'Links start with https://' : 'Only people going see it.'}
                />
              ) : (
                <AppText variant="caption" tone="subtle">
                  The room opens 15 minutes before the start, for you, your group&apos;s admins and everyone going. Nothing is recorded.
                </AppText>
              )}
            </View>
          ) : null}
        </View>

        {format !== 'virtual' ? <VenuePicker value={place} onChange={setPlace} lat={location?.lat} lng={location?.lng} /> : null}

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="muted">
            Who can see it
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Chip label="Public" selected={mode === 'public'} onPress={() => setMode('public')} />
            <Chip label="My Insiders only" selected={mode === 'circle'} onPress={() => setMode('circle')} />
            <Chip
              label="Surprise party"
              glyph="party"
              selected={mode === 'surprise'}
              onPress={() => {
                setMode('surprise');
                if (!circle)
                  fetchChatCandidates()
                    .then((l) => setCircle(l.filter((p) => p.in_circle)))
                    .catch(() => setCircle([]));
              }}
            />
          </View>
          <AppText variant="caption" tone="muted">
            {mode === 'public'
              ? 'Anyone on I’m In can find it.'
              : mode === 'circle'
                ? 'Only your Insiders, your group’s members and people who say I’m In can see it.'
                : 'Everyone can see it except the guest of honor. They won’t see the event, posts about it or any notices until it’s over.'}
          </AppText>
          {mode === 'surprise' ? (
            <View style={{ gap: t.space[2] }}>
              <AppText weight="bold">Who&apos;s it for?</AppText>
              {circle?.length ? (
                <PeoplePicker people={circle} selected={new Set(guest ? [guest] : [])} onToggle={(id) => setGuest((g) => (g === id ? null : id))} />
              ) : (
                <AppText variant="small" tone="subtle">
                  {circle ? 'Pick from your Insiders. You don’t have any Insiders yet.' : 'Loading…'}
                </AppText>
              )}
            </View>
          ) : null}
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Spots
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {CAPACITIES.map((c) => (
              <Chip key={String(c)} label={c == null ? 'No limit' : String(c)} selected={capacity === c} onPress={() => setCapacity(c)} />
            ))}
          </View>
        </View>

        {payouts?.charges_enabled ? (
          <View style={{ gap: t.space[1] }}>
            <TextField label="Ticket price ($)" optional value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Free" maxLength={7} />
            <AppText variant="caption" tone="subtle">
              Leave empty for a free event. I&apos;m In keeps {ticketSplit(0, settings).feePercent}% of each ticket and Stripe takes its card fee (2.9% + 30¢); the rest is yours.
              {parsePrice(price) != null ? ` At ${money(parsePrice(price))}, you get about ${money(ticketSplit(parsePrice(price) ?? 0, settings).host)}.` : ''}
            </AppText>
          </View>
        ) : (
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings/payouts')}>
            <AppText variant="small" tone="primary" weight="bold">
              Want to sell tickets? Set up payouts →
            </AppText>
          </Pressable>
        )}

        {groups.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" weight="medium" tone="muted">
              Host as
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {!online ? <Chip label="Just me" selected={groupId == null} onPress={() => setGroupId(null)} /> : null}
              {groups.map((g) => (
                <Chip key={g.id} label={g.name} glyph={isGlyphName(g.emoji) ? g.emoji : 'spark'} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <TextField label="Details" optional value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="What to expect, what to bring…" />

        <Button label="Post Event" onPress={submit} loading={busy} disabled={!ready} />
        <AppText variant="caption" tone="subtle">
          Your Insiders and Network see it first; people nearby see it on Tonight. You&apos;re automatically going.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
