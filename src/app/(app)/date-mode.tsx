import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Chip, GlyphTile, GlyphTitle, LoadingDetail, Screen, useToast } from '@/components/ui';
import { preciseLocation } from '@/features/circles/api';
import {
  checkInSafe,
  confirmDateMode,
  endDateMode,
  fetchDateMode,
  fetchDateModeCandidates,
  setCheckinInterval,
  startDateMode,
  type DateModeCandidate,
  type DateModeStatus,
} from '@/features/dates/api';
import { friendlyError } from '@/lib/supabase';
import { clockTime } from '@/lib/time';
import { useTheme } from '@/theme';

const INTERVALS = [30, 60, 90, 120];

/**
 * "I'm On a Date". Both people must be GPS-verified within 1 mile to start.
 * While it's on: check-ins on a timer, trusted contacts on standby, one-tap help.
 */
export default function DateMode() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<DateModeStatus | null | undefined>(undefined);
  const [candidates, setCandidates] = useState<DateModeCandidate[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([fetchDateMode(), fetchDateModeCandidates()]);
    setStatus(s);
    setCandidates(c);
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setStatus(null));
    }, [load]),
  );

  // Keep the countdown fresh, and pick up the other person's confirmation.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(() => {
      if (status?.status === 'waiting') load().catch(() => undefined);
    }, 10_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [status?.status, load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const activate = (partner: string) =>
    run(async () => {
      const r = await preciseLocation();
      await startDateMode(partner, r);
    });

  const confirm = (sessionId: number) =>
    run(async () => {
      const r = await preciseLocation();
      await confirmDateMode(sessionId, r);
    });

  const header = <BackHeader title="I'm On a Date" />;

  if (status === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <Screen>
          <LoadingDetail />
        </Screen>
      </View>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────────
  if (status?.status === 'active') {
    const due = status.next_checkin_at ? new Date(status.next_checkin_at).getTime() : null;
    const minsLeft = due != null ? Math.round((due - now) / 60000) : null;
    const overdue = minsLeft != null && minsLeft < 0;
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <Screen contentGap={t.space[5]}>
          <Card accent="trust">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <GlyphTile name="shield" size={48} tone="trust" />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">Date Mode is on</AppText>
                <AppText variant="small" tone="muted">
                  With {status.partner.display_name}
                  {status.activated_at ? ` · since ${clockTime(status.activated_at)}` : ''}
                </AppText>
                {status.distance_mi != null ? (
                  <AppText variant="caption" tone="trust">
                    GPS confirmed: {status.distance_mi} mi apart
                  </AppText>
                ) : null}
              </View>
            </View>
          </Card>

          <View style={{ alignItems: 'center', gap: t.space[2] }}>
            <AppText variant="label" tone="subtle">
              Next check-in
            </AppText>
            <AppText variant="h1" tone={overdue ? 'danger' : 'text'}>
              {minsLeft == null ? '—' : overdue ? 'Now' : minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : `${minsLeft} min`}
            </AppText>
            <AppText variant="small" tone="muted" align="center">
              {overdue ? 'You missed a check-in. Tap I’m safe, or get help below.' : 'Tap I’m safe before the timer runs out.'}
            </AppText>
          </View>

          <Button label="I'm safe" variant="trust" onPress={() => run(checkInSafe, 'Checked in. Enjoy your date.')} loading={busy} />

          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" weight="medium" tone="muted">
              Check in every
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {INTERVALS.map((m) => (
                <Chip
                  key={m}
                  label={m < 60 ? `${m} min` : `${m / 60} hr`}
                  selected={status.checkin_minutes === m}
                  onPress={() => run(() => setCheckinInterval(m))}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I need help"
            onPress={() => router.push('/safety/help')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              padding: t.space[4],
              borderRadius: t.radius.lg,
              borderWidth: t.borderWidth.regular,
              borderColor: t.colors.danger,
              opacity: pressed ? 0.8 : 1,
            })}>
            <GlyphTile name="siren" size={44} tone="primary" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" tone="danger">
                I need help
              </AppText>
              <AppText variant="small" tone="muted">
                Alert your contacts, share your location, call 911
              </AppText>
            </View>
          </Pressable>

          <Card onPress={() => router.push('/safety')} accessibilityLabel="Trusted contacts">
            <GlyphTitle glyph="people" tone={status.contacts ? 'trust' : 'sponsored'}>
              {status.contacts ? `${status.contacts} trusted contact${status.contacts === 1 ? '' : 's'} on standby` : 'Add a trusted contact'}
            </GlyphTitle>
            {!status.contacts ? (
              <AppText variant="small" tone="muted">
                Someone who gets your location if you need help. They don&apos;t need the app.
              </AppText>
            ) : null}
          </Card>

          <Button label="End Date Mode" variant="ghost" onPress={() => run(endDateMode, 'Date Mode ended. Get home safe.')} disabled={busy} />
        </Screen>
      </View>
    );
  }

  // ── Waiting for the other person ──────────────────────────────────────────
  if (status?.status === 'waiting') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <Screen contentGap={t.space[5]}>
          <View style={{ alignItems: 'center', gap: t.space[2] }}>
            <Avatar name={status.partner.display_name} uri={status.partner.avatar_url} size={72} ring="primary" />
            <AppText variant="h2" align="center">
              {status.i_started ? `Waiting for ${status.partner.display_name.split(' ')[0]}` : `${status.partner.display_name} wants to start Date Mode`}
            </AppText>
            <AppText tone="muted" align="center">
              {status.i_started
                ? 'They need to confirm on their phone. It turns on once you’re both within 1 mile.'
                : 'Confirm you’re there. Your exact location is never shown to anyone; it’s only used to check you’re within 1 mile.'}
            </AppText>
          </View>
          {status.problem ? (
            <Card accent="sponsored">
              <GlyphTitle glyph="warning" tone="sponsored">
                Not on yet
              </GlyphTitle>
              <AppText variant="small" tone="muted">
                {status.problem}
              </AppText>
            </Card>
          ) : null}
          {status.i_started ? (
            <Button label="Check my location again" variant="secondary" onPress={() => activate(status.partner.id)} loading={busy} />
          ) : (
            <Button label="I'm here: confirm" variant="trust" onPress={() => confirm(status.id)} loading={busy} />
          )}
          <Button label="Cancel" variant="ghost" onPress={() => run(endDateMode)} disabled={busy} />
        </Screen>
      </View>
    );
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {header}
      <Screen contentGap={t.space[5]}>
        <Card accent="primary">
          <GlyphTitle glyph="shield">Date Mode needs GPS proximity</GlyphTitle>
          <AppText variant="small" tone="muted">
            You and your date must be within 1 mile of each other to turn it on. That confirms the date is real and starts safety check-ins
            for both of you.
          </AppText>
        </Card>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Who are you on a date with?
          </AppText>
          {candidates.length === 0 ? (
            <AppText variant="small" tone="muted">
              Only people you connected with on I&apos;m In appear here: an accepted date or a friend.
            </AppText>
          ) : (
            candidates.map((c) => {
              const selected = chosen === c.user_id;
              return (
                <Pressable
                  key={c.user_id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${c.display_name}, ${c.detail}`}
                  onPress={() => setChosen(c.user_id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[3],
                    padding: t.space[3],
                    borderRadius: t.radius.md,
                    borderWidth: t.borderWidth.regular,
                    borderColor: selected ? t.colors.primary : t.colors.border,
                    backgroundColor: t.colors.surface,
                  }}>
                  <Avatar name={c.display_name} uri={c.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{c.display_name}</AppText>
                    <AppText variant="caption" tone="muted" numberOfLines={1}>
                      {c.detail} · {c.vouch_count} vouches
                    </AppText>
                  </View>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: selected ? t.colors.primary : t.colors.borderStrong,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
        <Button label="Activate Date Mode" variant="trust" onPress={() => chosen && activate(chosen)} disabled={!chosen} loading={busy} />
        <AppText variant="caption" tone="subtle">
          Your date gets a request to confirm they&apos;re there. Exact locations are never shown to anyone and are deleted after 30 days.
        </AppText>
      </Screen>
    </View>
  );
}
