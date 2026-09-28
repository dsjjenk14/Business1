import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { DateTimeChips, upcomingDays } from '@/components/tonight/DateTimeChips';
import { VenuePicker, type PlaceChoice } from '@/components/tonight/VenuePicker';
import { AppText, Button, Chip, type GlyphName, isGlyphName, Screen, TextField, useToast } from '@/components/ui';
import { createEvent } from '@/features/events/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { fetchPayoutStatus, money, parsePrice, setTicketPrice, type PayoutStatus } from '@/features/payments/api';
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
  const [groups, setGroups] = useState<{ id: number; name: string; emoji: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(params.group ? Number(params.group) : null);
  const [busy, setBusy] = useState(false);

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
  const ready = title.trim().length >= 2 && !!startsAt && !busy;

  async function submit() {
    if (!startsAt) return;
    setBusy(true);
    try {
      const id = await createEvent({
        title,
        glyph,
        startsAt,
        durationHours: duration,
        venueId: place.venueId,
        place: place.text,
        capacity,
        description,
        groupId,
        lat: location?.lat,
        lng: location?.lng,
      });
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

        <VenuePicker value={place} onChange={setPlace} lat={location?.lat} lng={location?.lng} />

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
              Leave empty for a free event. I&apos;m In keeps 12% of each ticket; Stripe takes its card fee; the rest is yours.
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
              <Chip label="Just me" selected={groupId == null} onPress={() => setGroupId(null)} />
              {groups.map((g) => (
                <Chip key={g.id} label={g.name} glyph={isGlyphName(g.emoji) ? g.emoji : 'spark'} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <TextField label="Details" optional value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="What to expect, what to bring…" />

        <Button label="Post Event" onPress={submit} loading={busy} disabled={!ready} />
        <AppText variant="caption" tone="subtle">
          Your circle and network see it first; people nearby see it on Tonight. You&apos;re automatically going.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
