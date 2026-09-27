import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { DateTimeChips, upcomingDays } from '@/components/tonight/DateTimeChips';
import { VenuePicker, type PlaceChoice } from '@/components/tonight/VenuePicker';
import { AppText, Avatar, Button, Card, Chip, Screen, TextField, useToast } from '@/components/ui';
import { DATE_VIBES, DATE_WHEN, counterDateRequest, fetchDate, sendDateRequest, type DateDetail, type DateWhen } from '@/features/dates/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { friendlyError } from '@/lib/supabase';
import { marketDate } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * Ask someone on a date (when, vibe, spot), or, with ?counter=<id>, suggest a
 * different time for a request you received.
 */
export default function NewDate() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ to?: string; counter?: string }>();
  const counterId = params.counter ? Number(params.counter) : null;
  const { location } = useApproxLocation();

  const [person, setPerson] = useState<ProfileCard | null>(null);
  const [original, setOriginal] = useState<DateDetail | null>(null);
  const [when, setWhen] = useState<DateWhen>('this_weekend');
  const [day, setDay] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceChoice>({ venueId: null, text: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => upcomingDays(21), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let to = params.to ?? null;
        if (counterId) {
          const d = await fetchDate(counterId);
          if (cancelled || !d) return;
          setOriginal(d);
          setVibe(d.vibe);
          to = d.other.id;
        }
        if (to) {
          const c = await fetchProfileCard(to);
          if (!cancelled) setPerson(c);
        }
      } catch {
        // Shown as "Loading…" below; the send button explains any problem.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.to, counterId]);

  const startsAt = when === 'specific' && day && minutes != null ? marketDate(day, minutes) : null;
  const ready = !!person && !busy && (when !== 'specific' || !!startsAt);
  const first = person?.display_name.split(' ')[0] ?? '';

  async function submit() {
    if (!person) return;
    setBusy(true);
    try {
      const input = { when, startsAt, vibe, venueId: place.venueId, place: place.text, note };
      const id = counterId ? await counterDateRequest(counterId, input) : await sendDateRequest(person.id, input);
      toast(counterId ? `Sent. ${first} will see your suggestion.` : `Sent. ${first} will see it in Messages.`);
      router.replace({ pathname: '/dates/[id]', params: { id: String(id) } });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title={counterId ? 'Suggest a Time' : 'Ask on a Date'} />
      <Screen contentGap={t.space[5]}>
        {person ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <Avatar name={person.display_name} uri={person.avatar_url} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" tone="subtle">
                  With
                </AppText>
                <AppText weight="bold">{person.display_name}</AppText>
                <AppText variant="caption" tone="muted">
                  {[`${person.vouch_count ?? 0} vouches`, person.degree === 1 ? '1st degree' : null].filter(Boolean).join(' · ')}
                </AppText>
              </View>
            </View>
          </Card>
        ) : (
          <AppText tone="subtle">Loading…</AppText>
        )}

        {original ? (
          <AppText tone="muted">
            {first} suggested {original.label}. Suggest something that works better for you.
          </AppText>
        ) : null}

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            When?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {DATE_WHEN.map((w) => (
              <Chip key={w.key} label={w.label} selected={when === w.key} onPress={() => setWhen(w.key)} />
            ))}
            <Chip label="Pick a day" glyph="calendar" selected={when === 'specific'} onPress={() => setWhen('specific')} />
          </View>
          {when === 'specific' ? (
            <DateTimeChips
              days={days}
              day={day}
              minutes={minutes}
              onChange={(d, m) => {
                setDay(d);
                setMinutes(m);
              }}
            />
          ) : null}
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Vibe
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {DATE_VIBES.map((v) => (
              <Chip key={v.key} label={v.label} glyph={v.glyph} selected={vibe === v.key} onPress={() => setVibe(vibe === v.key ? null : v.key)} />
            ))}
          </View>
        </View>

        <VenuePicker label="Where?" value={place} onChange={setPlace} lat={location?.lat} lng={location?.lng} />
        <TextField label="Add a note" optional value={note} onChangeText={setNote} maxLength={300} multiline placeholder="I've been wanting to try this place." />

        <Button label={counterId ? 'Send Suggestion' : 'Send Date Request'} onPress={submit} loading={busy} disabled={!ready} />
        <AppText variant="caption" tone="subtle">
          {first || 'They'} can accept, suggest another time, or pass. Passing is always okay, and no reason is ever needed.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
