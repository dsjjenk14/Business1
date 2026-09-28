import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, EmptyState, GlyphTile, GlyphTitle, LoadingDetail, Screen, useToast, type GlyphName } from '@/components/ui';
import { openDirectChat } from '@/features/chat/api';
import { cancelDateRequest, dateVibe, fetchDate, respondDateRequest, type DateDetail } from '@/features/dates/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** A date request: receive (accept / suggest another time / pass), waiting, it's a date, or passed. */
export default function DateScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<DateDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await fetchDate(Number(id)));
    } catch {
      setD(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    if (!d) return;
    try {
      const conv = d.conversation_id ?? (await openDirectChat(d.other.id));
      router.push({ pathname: '/chat/[id]', params: { id: String(conv) } });
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Date Request" />
        <Screen>
          {d === undefined ? (
            <LoadingDetail />
          ) : (
            <EmptyState glyph="heart" title="This date request isn’t available" body="It may have been cancelled." />
          )}
        </Screen>
      </View>
    );
  }

  const first = d.other.display_name.split(' ')[0];
  const vibe = dateVibe(d.vibe);
  const incoming = !d.i_sent && d.status === 'pending';

  const hero = (glyph: GlyphName, title: string, body: string, tone: 'primary' | 'trust' | 'muted' = 'primary') => (
    <View style={{ alignItems: 'center', gap: t.space[2] }}>
      <GlyphTile name={glyph} size={64} tone={tone} />
      <AppText variant="h2" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="muted" align="center">
        {body}
      </AppText>
    </View>
  );

  const details = (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <Avatar name={d.other.display_name} uri={d.other.avatar_url} size={44} />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">{d.other.display_name}</AppText>
            <AppText variant="caption" tone="muted">
              {[`${d.other.vouch_count} vouches`, d.other.degree === 1 ? '1st degree' : d.other.via ? `via ${d.other.via}` : null].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </View>
        <Row label="When" value={d.when_kind === 'specific' && d.starts_at ? dayTime(d.starts_at) : d.label.split(' · ')[0] ?? d.label} />
        {vibe ? <Row label="Vibe" value={vibe.label} glyph={vibe.glyph} /> : null}
        {d.place ? <Row label="Spot" value={[d.place, d.neighborhood].filter(Boolean).join(' · ')} /> : null}
        {d.note ? <AppText variant="small">“{d.note}”</AppText> : null}
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Date Request" />
      <Screen contentGap={t.space[5]}>
        {incoming ? (
          <>
            {hero('heart', 'You got a date request', `${first} wants to take you out.`)}
            {details}
            {d.other.via && d.other.degree !== 1 ? (
              <AppText variant="small" tone="trust" align="center">
                {d.other.via} knows {first}
              </AppText>
            ) : null}
            <Card accent="trust">
              <GlyphTitle glyph="shield" tone="trust">
                Safety comes with it
              </GlyphTitle>
              <AppText variant="small" tone="muted">
                When you meet, turn on Date Mode: check-ins on a timer, your trusted contacts on standby, and one-tap help.
              </AppText>
            </Card>
            <Button label="I'm In: Accept" variant="trust" onPress={() => run(() => respondDateRequest(d.id, true))} loading={busy} />
            <Button
              label="Suggest a Different Time"
              variant="secondary"
              onPress={() => router.push({ pathname: '/dates/new', params: { counter: String(d.id) } })}
              disabled={busy}
            />
            <Button label="Pass" variant="ghost" onPress={() => run(() => respondDateRequest(d.id, false))} disabled={busy} />
          </>
        ) : d.status === 'pending' ? (
          <>
            {hero('mail', 'Request sent', `Waiting on ${first}. They can accept, suggest another time, or pass. You'll get a notification either way.`)}
            {details}
            <Button label={`Message ${first}`} variant="secondary" onPress={message} />
            <Button label="Cancel request" variant="ghost" onPress={() => run(() => cancelDateRequest(d.id))} disabled={busy} />
          </>
        ) : d.status === 'accepted' ? (
          <>
            {hero('party', "It's a date!", d.i_sent ? `${first} said yes.` : `${first} knows you're in.`, 'trust')}
            {details}
            <Button label={`Message ${first}`} variant="secondary" onPress={message} />
            <Button label="Start Date Mode when you meet" variant="trust" onPress={() => router.push('/date-mode')} />
            <Button label="Set up trusted contacts" variant="ghost" onPress={() => router.push('/safety')} />
          </>
        ) : d.status === 'countered' ? (
          <>
            {hero('clock', d.i_sent ? `${first} suggested another time` : 'You suggested another time', 'The new suggestion replaces this one.')}
            {d.counter_id ? (
              <Button label="See the new suggestion" onPress={() => router.replace({ pathname: '/dates/[id]', params: { id: String(d.counter_id) } })} />
            ) : null}
          </>
        ) : d.status === 'passed' ? (
          d.i_sent ? (
            hero('seed', 'Not this time', 'No explanation needed. Passing is always okay on I’m In.', 'muted')
          ) : (
            hero('seed', 'No worries', `${first} will be told politely. Passing is always okay on I'm In.`, 'muted')
          )
        ) : (
          hero('seed', 'Cancelled', 'This date request was cancelled.', 'muted')
        )}
      </Screen>
    </View>
  );
}

function Row({ label, value, glyph }: { label: string; value: string; glyph?: GlyphName }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
      <AppText variant="small" tone="subtle" style={{ width: 52 }}>
        {label}
      </AppText>
      {glyph ? <GlyphTile name={glyph} size={28} /> : null}
      <AppText variant="small" weight="bold" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}
