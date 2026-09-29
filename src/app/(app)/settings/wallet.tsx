import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { DrinkIcon } from '@/components/drinks/DrinkIcon';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Chip, LoadingDetail, Screen, Section, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { aDrink } from '@/features/drinks/words';
import { buyDrinkCredit, cashOutDrinks, DRINK_PACKS, fetchWallet, usd, type Wallet } from '@/features/drinks/api';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * Drinks & credit: buy credit to send drinks when people are live, and cash
 * out the drinks you've been sent.
 */
export default function WalletScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ paid?: string }>();
  const [w, setW] = useState<Wallet | null>(null);
  const [pack, setPack] = useState(DRINK_PACKS[1]!);
  const [busy, setBusy] = useState<'buy' | 'cashout' | null>(null);

  const load = useCallback(() => {
    fetchWallet()
      .then(setW)
      .catch(() => toast('Couldn’t load your credit.'));
  }, [toast]);
  useFocusEffect(load);

  async function buy() {
    setBusy('buy');
    try {
      track('drink_credit_checkout', { cents: pack });
      await buyDrinkCredit(pack);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payments aren’t available right now.');
    } finally {
      setBusy(null);
    }
  }

  async function cashOut() {
    setBusy('cashout');
    try {
      const r = await cashOutDrinks();
      toast(`${usd(r.cents)} is on its way to your bank.`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t cash out right now.');
    } finally {
      setBusy(null);
    }
  }

  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Drinks & credit" />
        <LoadingDetail />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Drinks & credit" />
      <Screen>
        {params.paid ? (
          <AppText tone="trust" weight="bold">
            Thanks! Your credit shows up here in a moment.
          </AppText>
        ) : null}
        <Card accent="primary">
          <View style={{ gap: t.space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <DrinkIcon drink="margarita" size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" tone="muted">
                  Drink credit
                </AppText>
                <AppText variant="h1">{usd(w.balance_cents)}</AppText>
              </View>
            </View>
            <AppText variant="small" tone="muted">
              Send drinks to people when they&apos;re live, on a live video or in a virtual event&apos;s room. They get {w.host_share_pct}% of every drink as real money.
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {DRINK_PACKS.map((c) => (
                <Chip key={c} label={usd(c)} selected={pack === c} onPress={() => setPack(c)} />
              ))}
            </View>
            <Button label={`Add ${usd(pack)} of credit`} onPress={buy} loading={busy === 'buy'} />
            <AppText variant="caption" tone="subtle">
              Paid by card through Stripe. Credit is for sending drinks on I&apos;m In; it can&apos;t be cashed out or refunded once sent.
            </AppText>
          </View>
        </Card>

        <Section title="Drinks you've been sent">
          <AppText>
            <AppText weight="bold">{usd(w.available_cents)}</AppText>
            <AppText tone="muted"> ready to cash out · {usd(w.lifetime_cents)} all time</AppText>
          </AppText>
          {w.payouts_ready ? (
            <Button
              label={`Cash out ${usd(w.available_cents)}`}
              variant="trust"
              onPress={cashOut}
              loading={busy === 'cashout'}
              disabled={w.available_cents < w.cashout_min_cents}
            />
          ) : (
            <Button label="Set up payouts to cash out" variant="secondary" onPress={() => router.push('/settings/payouts')} />
          )}
          <AppText variant="caption" tone="subtle">
            Cash out once you have {usd(w.cashout_min_cents)}. Money goes to the bank account on your Stripe payouts, usually in 2 business days.
          </AppText>
        </Section>

        <Section title="Recent drinks">
          {w.history.length === 0 ? (
            <AppText variant="small" tone="muted">
              No drinks yet. When someone is live, tap the glass to send one.
            </AppText>
          ) : (
            w.history.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <View style={{ borderRadius: t.radius.sm, backgroundColor: '#17161A', padding: 2 }}>
                  <DrinkIcon drink={h.drink} size={36} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="small" weight="bold">
                    {h.sent ? `You sent ${h.other ?? 'someone'} ${aDrink(h.name)}` : `${h.other ?? 'Someone'} sent you ${aDrink(h.name)}`}
                  </AppText>
                  <AppText variant="caption" tone="subtle">
                    {timeAgo(h.at)}
                  </AppText>
                </View>
                <AppText variant="small" weight="bold" tone={h.sent ? 'muted' : 'trust'}>
                  {h.sent ? `−${usd(h.cents)}` : `+${usd(h.cents)}`}
                </AppText>
              </View>
            ))
          )}
        </Section>
      </Screen>
    </View>
  );
}
