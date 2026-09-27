import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Chip, Screen, TextField, useToast } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { VIBES, endLive, fetchTonightNetwork, goLive } from '@/features/tonight/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

/**
 * Go Live: tell your network you're going out tonight. It also drops a
 * "Going Out" pin. Ends automatically at 4 AM. (The full going-out flow with
 * venues, weekend plans and the map comes with the Tonight tab in Phase 4.)
 */
export default function GoLive() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { location } = useApproxLocation();
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [vibes, setVibes] = useState<string[]>([]);
  const [live, setLive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchTonightNetwork().then((p) => {
        if (cancelled) return;
        const mine = p.find((x) => x.is_me);
        setLive(!!mine);
        if (mine?.place) setPlace(mine.place);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function submit() {
    setBusy(true);
    try {
      await goLive({ place: place.trim(), note: note.trim(), vibes, lat: location?.lat, lng: location?.lng });
      toast("You're live tonight 📍");
      goBackOr(router, '/');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await endLive();
      toast("You're no longer live");
      goBackOr(router, '/');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title={live ? "You're live" : 'Go Live'} />
      <Screen contentGap={t.space[5]}>
        <AppText tone="muted">
          Let your circle and network know you&apos;re out tonight. You&apos;ll show up on their Home and a Going Out pin is dropped. It ends
          at 4 AM on its own.
        </AppText>
        <TextField label="Where to?" optional value={place} onChangeText={setPlace} maxLength={80} placeholder="Founding Farmers, Tysons" />
        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Vibe
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {VIBES.map((v) => (
              <Chip
                key={v.key}
                label={v.label}
                selected={vibes.includes(v.key)}
                onPress={() => setVibes((s) => (s.includes(v.key) ? s.filter((x) => x !== v.key) : [...s, v.key]))}
              />
            ))}
          </View>
        </View>
        <TextField label="Say something" optional value={note} onChangeText={setNote} maxLength={200} placeholder="Flying solo, come find me." />
        <Button label={live ? 'Update' : 'Go Live'} onPress={submit} loading={busy} />
        {live ? <Button label="I'm heading home (end)" variant="ghost" onPress={stop} disabled={busy} /> : null}
        <AppText variant="caption" tone="subtle">
          📍 Your location is shared approximately, never exactly. Hide your venue any time in Privacy settings.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
