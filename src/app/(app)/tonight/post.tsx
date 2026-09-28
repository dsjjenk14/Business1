import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { DateTimeChips, upcomingDays } from '@/components/tonight/DateTimeChips';
import { VenuePicker, type PlaceChoice } from '@/components/tonight/VenuePicker';
import { AppText, Button, Chip, Screen, Segmented, TextField, useToast } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { VIBES, deleteGoingOut, postGoingOut, setOpenToJoin, type GoingOutWhen } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { goBackOr } from '@/lib/navigation';
import { friendlyError, supabase } from '@/lib/supabase';
import { dayTime, marketDate, marketDayKey } from '@/lib/time';
import { useTheme } from '@/theme';

type Existing = {
  id: number;
  when_kind: GoingOutWhen;
  starts_at: string;
  place: string | null;
  venue_id: number | null;
  vibes: string[];
  note: string | null;
  open_to_join: boolean;
};

/**
 * "I'm Going Out": tonight, this weekend, or a specific time. Shows on the
 * Tonight feed and drops a Going Out pin. Location is shared approximately.
 */
export default function PostGoingOut() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const params = useLocalSearchParams<{ when?: GoingOutWhen }>();
  const { location } = useApproxLocation();

  const [when, setWhen] = useState<GoingOutWhen>(params.when === 'weekend' || params.when === 'scheduled' ? params.when : 'tonight');
  const [place, setPlace] = useState<PlaceChoice>({ venueId: null, text: '' });
  const [vibes, setVibes] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [openToJoin, setOpenToJoinState] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const allDays = useMemo(() => upcomingDays(14), []);
  const todayKey = allDays[0]?.key ?? marketDayKey(new Date());
  // This weekend: the days from today through Sunday.
  const weekendDays = useMemo(() => {
    const out: typeof allDays = [];
    for (const d of allDays) {
      out.push(d);
      if (d.weekday === 'Sun') break;
    }
    return out.filter((d) => ['Fri', 'Sat', 'Sun'].includes(d.weekday));
  }, [allDays]);

  useEffect(() => {
    if (!me) return;
    supabase
      .from('going_out_posts')
      .select('id, when_kind, starts_at, place_text, venue_id, vibes, note, open_to_join, venues(name)')
      .eq('user_id', me)
      .gt('expires_at', new Date().toISOString())
      .order('starts_at')
      .then(({ data }) => {
        const rows = (data ?? []).map((r) => ({
          id: r.id,
          when_kind: r.when_kind,
          starts_at: r.starts_at,
          place: r.venues?.name ?? r.place_text,
          venue_id: r.venue_id,
          vibes: r.vibes,
          note: r.note,
          open_to_join: r.open_to_join,
        }));
        setExisting(rows);
        const tonight = rows.find((r) => r.when_kind === 'tonight');
        if (tonight && (params.when ?? 'tonight') === 'tonight') {
          setPlace({ venueId: tonight.venue_id, text: tonight.place ?? '' });
          setVibes(tonight.vibes);
          setNote(tonight.note ?? '');
          setOpenToJoinState(tonight.open_to_join);
        }
      });
  }, [me, params.when]);

  const startsAt = (() => {
    if (when === 'tonight') return minutes != null ? marketDate(todayKey, minutes) : null;
    if (day && minutes != null) return marketDate(day, minutes);
    return null;
  })();
  const needsTime = when === 'scheduled' || (when === 'weekend' && !day);
  const canPost = !busy && !(when === 'scheduled' && !startsAt) && !(when === 'weekend' && !day);

  async function submit() {
    setBusy(true);
    try {
      const postId = await postGoingOut({
        when,
        // Weekend with just a day: 7 PM that day (or now, if that's already passed).
        startsAt: when === 'weekend' && day && minutes == null ? new Date(Math.max(marketDate(day, 19 * 60).getTime(), Date.now())) : startsAt,
        venueId: place.venueId,
        place: place.text.trim(),
        vibes,
        note: note.trim(),
        lat: location?.lat,
        lng: location?.lng,
      });
      if (!openToJoin) await setOpenToJoin(postId, false);
      if (place.venueId) enableArrivalWatch();
      toast(when === 'tonight' ? "You're on the Tonight feed" : 'Your plans are posted');
      goBackOr(router, '/tonight');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await deleteGoingOut(id);
      setExisting((rows) => rows.filter((r) => r.id !== id));
      toast('Plans removed');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // After midnight "tonight" is almost over: only "Now".
  const lateNight = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })) % 24 < 4;
  const tonightTimes = [
    { label: 'Now', m: null },
    ...[18, 19, 20, 21, 22].map((h) => ({ label: `${h - 12} PM`, m: h * 60 })),
  ].filter((x) => x.m == null || (!lateNight && marketDate(todayKey, x.m).getTime() > openedAt - 30 * 60_000));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="I'm Out" />
      <Screen contentGap={t.space[5]}>
        {existing.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" weight="medium" tone="muted">
              Your plans
            </AppText>
            {existing.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <AppText variant="small" style={{ flex: 1 }}>
                  {[r.when_kind === 'tonight' ? 'Tonight' : dayTime(r.starts_at), r.place].filter(Boolean).join(' · ')}
                </AppText>
                <Button label="Remove" size="md" variant="ghost" onPress={() => remove(r.id)} disabled={busy} />
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            When?
          </AppText>
          <Segmented<GoingOutWhen>
            options={[
              { key: 'tonight', label: 'Tonight' },
              { key: 'weekend', label: 'This Weekend' },
              { key: 'scheduled', label: 'Pick a Time' },
            ]}
            value={when}
            onChange={(w) => {
              setWhen(w);
              setDay(null);
              setMinutes(null);
            }}
          />
          {when === 'tonight' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {tonightTimes.map((x) => (
                <Chip key={x.label} label={x.label} selected={minutes === x.m} onPress={() => setMinutes(x.m)} />
              ))}
            </View>
          ) : when === 'weekend' ? (
            weekendDays.length ? (
              <DateTimeChips
                days={weekendDays}
                day={day}
                minutes={minutes}
                onChange={(d, m) => {
                  setDay(d);
                  setMinutes(m);
                }}
              />
            ) : null
          ) : (
            <DateTimeChips
              days={allDays}
              day={day}
              minutes={minutes}
              onChange={(d, m) => {
                setDay(d);
                setMinutes(m);
              }}
            />
          )}
          {needsTime ? (
            <AppText variant="caption" tone="subtle">
              {when === 'weekend' ? 'Pick a day. The time is optional.' : 'Pick a day and a time.'}
            </AppText>
          ) : null}
        </View>

        <VenuePicker value={place} onChange={setPlace} lat={location?.lat} lng={location?.lng} />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Vibe
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {VIBES.map((v) => (
              <Chip
                key={v.key}
                label={v.label}
                glyph={v.glyph}
                selected={vibes.includes(v.key)}
                onPress={() => setVibes((s) => (s.includes(v.key) ? s.filter((x) => x !== v.key) : [...s, v.key]))}
              />
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Let people I know join me</AppText>
            <AppText variant="caption" tone="muted">
              Your circle and network can tap Join so you know they&apos;re coming.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Let people I know join me"
            value={openToJoin}
            onValueChange={setOpenToJoinState}
            trackColor={{ true: t.colors.trust, false: t.colors.surfaceAlt }}
          />
        </View>

        <TextField label="Say something" optional value={note} onChangeText={setNote} maxLength={200} placeholder="Flying solo, come find me." />
        <Button label={when === 'tonight' ? "I'm Out Tonight" : 'Post my plans'} onPress={submit} loading={busy} disabled={!canPost} />
        <AppText variant="caption" tone="subtle">
          Your location is shared approximately, never exactly. When you get there, tap I&apos;m In so your circle knows you&apos;re there. Tonight posts end at 4 AM on their own. Hide your venue any time in Privacy
          settings.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
