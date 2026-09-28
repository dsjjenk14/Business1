import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AIMark, AppText, Button, Card, useToast } from '@/components/ui';
import { aiErrorText, fetchIntroOdds, runAI, type IntroOdds } from '@/features/ai/api';
import { track } from '@/features/analytics/track';
import { useTheme } from '@/theme';

/**
 * Intro odds: how likely these two meet up within 30 days. The score and
 * signals are free and update live as you change who's picked; the AI
 * explanation is one tap (and one AI use).
 */
export function IntroOddsPanel({ a, b }: { a: string; b: string }) {
  const t = useTheme();
  const toast = useToast();
  const pair = `${a}:${b}`;
  const [odds, setOdds] = useState<{ pair: string; value: IntroOdds | null } | null>(null);
  const [why, setWhy] = useState<{ pair: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchIntroOdds(a, b)
      .then((value) => !cancelled && setOdds({ pair: `${a}:${b}`, value }))
      .catch(() => !cancelled && setOdds({ pair: `${a}:${b}`, value: null }));
    return () => {
      cancelled = true;
    };
  }, [a, b]);

  const current = odds?.pair === pair ? odds.value : undefined;
  if (current === null) return null;
  if (!current) return <Card><AppText variant="small" tone="muted">Checking the odds…</AppText></Card>;

  const color = current.band === 'high' ? t.colors.trust : current.band === 'medium' ? t.colors.primary : t.colors.danger;
  const label = current.band === 'high' ? 'Good odds' : current.band === 'medium' ? 'Decent odds' : 'Long shot';

  async function explain() {
    setBusy(true);
    try {
      const r = await runAI<{ reasoning: string }>('intro_odds', { subject: pair });
      setWhy({ pair, text: r.result.reasoning });
      track('ai_used', { feature: 'intro_odds', cached: r.cached });
    } catch (e) {
      toast(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="ai">
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <AppText weight="bold">Chance they actually meet up</AppText>
          <AppText variant="h2" style={{ color }}>
            {current.score}%
          </AppText>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${label}: ${current.score}% chance ${current.a} and ${current.b} meet up within 30 days`}
          style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${current.score}%`, height: '100%', backgroundColor: color }} />
        </View>
        <AppText variant="caption" tone="subtle">
          {label} of a real meetup within 30 days.
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {current.signals.map((s) => (
            <View
              key={s.label}
              style={{
                paddingHorizontal: t.space[2],
                paddingVertical: 4,
                borderRadius: t.radius.sm,
                borderWidth: t.borderWidth.hairline,
                borderColor: s.good ? t.colors.trust : t.colors.border,
              }}>
              <AppText variant="caption" tone={s.good ? 'trust' : 'muted'}>
                {s.good ? '+ ' : '– '}
                {s.label}
              </AppText>
            </View>
          ))}
        </View>
        {why?.pair === pair ? (
          <View style={{ gap: t.space[1] }}>
            <AIMark label="Why" />
            <AppText variant="small">{why.text}</AppText>
          </View>
        ) : (
          <Button label="Explain with AI" size="md" variant="ghost" onPress={explain} loading={busy} />
        )}
      </View>
    </Card>
  );
}
