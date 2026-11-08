import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, Chip, GlyphTitle, TextField, useToast } from '@/components/ui';
import { endSafetyTimer, extendSafetyTimer, fetchSafetyTimer, startSafetyTimer, type SafetyTimer } from '@/features/dates/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { clockTime } from '@/lib/time';
import { useTheme } from '@/theme';

const CHOICES = [30, 60, 90, 120];
const label = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} hr`);

/**
 * Before you walk in: set a time to check in. If you don't tap I'm safe by
 * then, you get a missed check-in alert with one-tap help. Works before your
 * date is on I'm In or you're both there.
 */
export function SafetyTimerCard() {
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [timer, setTimer] = useState<SafetyTimer | null | undefined>(undefined);
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!me) return;
    fetchSafetyTimer(me)
      .then((v) => {
        setTimer(v);
        setNow(Date.now());
      })
      .catch(() => setTimer(null));
  }, [me]);
  useEffect(load, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (timer === undefined) return null;

  if (timer) {
    const minsLeft = Math.round((new Date(timer.check_at).getTime() - now) / 60000);
    const overdue = minsLeft < 0;
    return (
      <Card accent={overdue ? 'primary' : 'trust'}>
        <View style={{ gap: t.space[3] }}>
          <GlyphTitle glyph="clock" tone={overdue ? 'danger' : 'trust'}>
            {overdue ? 'Time to check in' : `Check in by ${clockTime(timer.check_at)}`}
          </GlyphTitle>
          <AppText variant="small" tone="muted">
            {overdue
              ? 'Your timer ran out. Tap I’m safe, or get help.'
              : `${label(Math.max(minsLeft, 1))} left${timer.note ? ` · ${timer.note}` : ''}. If you don’t check in, you’ll get an alert with one-tap help.`}
          </AppText>
          <Button label="I’m safe" variant="trust" onPress={() => run(endSafetyTimer, 'Glad you’re okay. Timer off.')} loading={busy} />
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label="+30 min" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => extendSafetyTimer(30), 'Added 30 minutes')} disabled={busy} />
            <Button label="I need help" size="md" variant="danger" style={{ flex: 1 }} onPress={() => router.push('/safety/help')} />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <GlyphTitle glyph="clock">Before you go in</GlyphTitle>
        <AppText variant="small" tone="muted">
          Set a time to check in. If you don&apos;t tap I&apos;m safe by then, you get an alert with one-tap help.
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }} accessibilityRole="radiogroup">
          {CHOICES.map((m) => (
            <Chip key={m} label={label(m)} selected={minutes === m} onPress={() => setMinutes(m)} accessibilityLabel={`Check in after ${label(m)}`} />
          ))}
        </View>
        <TextField label="Note for yourself" optional value={note} onChangeText={setNote} maxLength={120} placeholder="Meeting Jordan at Busboys" />
        <Button label={`Start timer · check in by ${clockTime(new Date(now + minutes * 60000).toISOString())}`} onPress={() => run(() => startSafetyTimer(minutes, note), 'Timer started')} loading={busy} />
      </View>
    </Card>
  );
}
