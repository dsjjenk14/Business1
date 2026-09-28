import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTitle, LoadingList, Screen, Section, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { fetchPayoutStatus, money, openPayment, refreshPayouts, type PayoutStatus } from '@/features/payments/api';
import { useTheme } from '@/theme';

/**
 * Payouts: hosts connect a Stripe account to sell tickets. Buyers pay the
 * ticket price; I'm In keeps its fee (8%), the host covers Stripe's card fee,
 * and Stripe sends the rest to the host.
 */
export default function Payouts() {
  const t = useTheme();
  const toast = useToast();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchPayoutStatus()
      .then((s) => {
        setStatus(s);
        // Back from Stripe setup: ask Stripe directly, then show the result.
        if (s.connected && !s.charges_enabled) {
          refreshPayouts()
            .then((r) => (r.charges_enabled ? fetchPayoutStatus().then(setStatus) : undefined))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);

  async function go(action: 'payouts_setup' | 'payouts_dashboard') {
    setBusy(true);
    try {
      if (action === 'payouts_setup') track('payouts_setup_opened');
      await openPayment(action);
      load();
      setTimeout(load, 4000);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payments aren’t available right now.');
    } finally {
      setBusy(false);
    }
  }

  const fee = status?.fee_percent ?? 12;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Payouts" />
      <Screen contentGap={t.space[5]}>
        {!status ? (
          <LoadingList rows={2} avatar={false} />
        ) : (
          <>
            <Card accent={status.charges_enabled ? 'trust' : 'primary'}>
              <View style={{ gap: t.space[2] }}>
                <GlyphTitle glyph="coin" tone={status.charges_enabled ? 'trust' : 'primary'}>
                  {status.charges_enabled ? 'You can sell tickets' : status.connected ? 'Finish setting up payouts' : 'Sell tickets to your events'}
                </GlyphTitle>
                <AppText variant="small" tone="muted">
                  {status.charges_enabled
                    ? 'Add a ticket price when you host an event (or on the event page). Money from sales goes to your bank account.'
                    : 'Connect a payout account through Stripe (it takes a few minutes: your name, date of birth, and a bank account). Then you can put a price on your events.'}
                </AppText>
                {status.charges_enabled ? (
                  <Button label="Open my payouts dashboard" size="md" variant="secondary" onPress={() => go('payouts_dashboard')} loading={busy} />
                ) : (
                  <Button label={status.connected ? 'Continue setup' : 'Set up payouts'} size="md" onPress={() => go('payouts_setup')} loading={busy} />
                )}
              </View>
            </Card>

            {status.sales.tickets ? (
              <Section title="Your ticket sales">
                <Card>
                  <View style={{ gap: t.space[1] }}>
                    {[
                      ['Tickets sold', String(status.sales.tickets)],
                      ['Total sales', money(status.sales.gross_cents)],
                      [`I’m In fee (${fee}%)`, `−${money(status.sales.fee_cents)}`],
                      ['Card fees (Stripe)', `−${money(status.sales.card_fee_cents ?? 0)}`],
                      ['Yours', money(status.sales.host_cents)],
                    ].map(([label, value], i) => (
                      <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="small" weight={i === 4 ? 'bold' : undefined}>
                          {label}
                        </AppText>
                        <AppText variant="small" weight={i === 4 ? 'bold' : undefined} tone={i === 4 ? 'trust' : 'text'}>
                          {value}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </Card>
              </Section>
            ) : null}

            <Section title="How it works">
              <AppText variant="small" tone="muted">
                People pay by card through Stripe when they tap Buy Tickets. I&apos;m In keeps {fee}% of each ticket, and Stripe&apos;s card fee (2.9% +
                30¢) comes out of your share. Stripe sends the rest to your bank on a regular schedule. To refund someone, open your event and tap
                Refund next to their name; they&apos;re taken off the guest list automatically.
              </AppText>
            </Section>
          </>
        )}
      </Screen>
    </View>
  );
}
