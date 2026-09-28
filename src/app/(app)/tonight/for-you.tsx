import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AIMark, AppText, Button, Card, EmptyState, LoadingDetail, Screen, Section } from '@/components/ui';
import { AIError, aiErrorText, quotaText, runAI, type AIQuota, type TonightForYou, type TonightOption } from '@/features/ai/api';
import { track } from '@/features/analytics/track';
import { useTheme } from '@/theme';

/**
 * Tonight for You: one AI pick for tonight with the reasons (who'll be there,
 * how it grows your network, a chance to vouch), plus two alternatives.
 * A pick stays for two hours; Refresh makes a new one.
 */
export default function TonightForYouScreen() {
  const t = useTheme();
  const router = useRouter();
  const [data, setData] = useState<TonightForYou | null>(null);
  const [quota, setQuota] = useState<AIQuota | null>(null);
  const [error, setError] = useState<AIError | Error | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchPick = useCallback(async (refresh: boolean) => {
    try {
      const r = await runAI<TonightForYou>('tonight', { refresh });
      setData(r.result);
      setQuota(r.quota);
      setError(null);
      track('ai_used', { feature: 'tonight', refresh, cached: r.cached });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  }, []);

  const load = (refresh: boolean) => {
    setBusy(true);
    setError(null);
    fetchPick(refresh);
  };

  useEffect(() => {
    let cancelled = false;
    runAI<TonightForYou>('tonight')
      .then((r) => {
        if (cancelled) return;
        setData(r.result);
        setQuota(r.quota);
        track('ai_used', { feature: 'tonight', refresh: false, cached: r.cached });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (o: TonightOption) =>
    o.kind === 'event'
      ? router.push({ pathname: '/events/[id]', params: { id: String(o.id) } })
      : router.push({ pathname: '/venues/[id]', params: { id: String(o.id) } });

  const who = (o: TonightOption) =>
    [
      o.friends_going.length ? `${o.friends_going.slice(0, 3).join(', ')} going` : null,
      o.network_going ? `${o.network_going} one intro away` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const code = error instanceof AIError ? error.code : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Tonight for You" />
      <Screen>
        {busy && !data ? (
          <LoadingDetail />
        ) : error && !data ? (
          code === 'not_configured' ? (
            <EmptyState glyph="spark" title="Coming soon" body="AI picks for tonight are almost ready. For now, see who's out on the Tonight tab." action={{ label: 'See Tonight', onPress: () => router.replace('/tonight') }} />
          ) : code === 'limit' ? (
            <EmptyState glyph="spark" title="No free AI picks left" body={error.message} action={{ label: 'See Premium', onPress: () => router.push('/premium') }} />
          ) : (
            <EmptyState glyph="warning" title="No pick right now" body={aiErrorText(error)} action={{ label: 'Try again', onPress: () => load(false) }} />
          )
        ) : data && !data.pick ? (
          <EmptyState glyph="moon" title="Quiet night so far" body="Nothing's on near you tonight yet. Post that you're in and see who joins." action={{ label: "I'm In tonight", onPress: () => router.push('/tonight/post') }} />
        ) : data?.pick ? (
          <>
            <Card accent="ai">
              <View style={{ gap: t.space[3] }}>
                <AIMark label="Top pick" />
                <View style={{ gap: t.space[1] }}>
                  <AppText variant="h2">{data.pick.headline || data.pick.title}</AppText>
                  <AppText variant="small" tone="muted">
                    {[data.pick.title !== data.pick.headline ? data.pick.title : null, data.pick.where !== data.pick.title ? data.pick.where : null, data.pick.starts]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                  {who(data.pick) ? (
                    <AppText variant="small" weight="bold">
                      {who(data.pick)}
                    </AppText>
                  ) : null}
                </View>
                <View style={{ gap: t.space[2] }}>
                  {data.pick.reasons.map((r) => (
                    <View key={r} style={{ flexDirection: 'row', gap: t.space[2] }}>
                      <AppText tone="ai">•</AppText>
                      <AppText variant="small" style={{ flex: 1 }}>
                        {r}
                      </AppText>
                    </View>
                  ))}
                </View>
                <Button label={data.pick.kind === 'event' ? 'See the event' : 'See the spot'} onPress={() => open(data.pick!)} />
              </View>
            </Card>

            {data.alternatives.length ? (
              <Section title="Or">
                {data.alternatives.map((a) => (
                  <Card key={a.key} onPress={() => open(a)} accessibilityLabel={`${a.title}. ${a.reason}`}>
                    <View style={{ gap: t.space[1] }}>
                      <AppText weight="bold">{a.title}</AppText>
                      <AppText variant="caption" tone="subtle">
                        {[a.where !== a.title ? a.where : null, a.starts, who(a)].filter(Boolean).join(' · ')}
                      </AppText>
                      <AppText variant="small" tone="ai">
                        {a.reason}
                      </AppText>
                    </View>
                  </Card>
                ))}
              </Section>
            ) : null}

            {error ? (
              <AppText variant="small" tone="danger">
                {aiErrorText(error)}
              </AppText>
            ) : null}
            <Button label="New pick" variant="ghost" size="md" onPress={() => load(true)} loading={busy} />
            <AppText variant="caption" tone="subtle" align="center">
              Picked from what&apos;s on near you and where your people are going.{quotaText(quota) ? ` ${quotaText(quota)}.` : ''}
            </AppText>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
