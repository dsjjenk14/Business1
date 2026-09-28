import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Badge, Button, Card, EmptyState, GlyphTitle, LoadingDetail, Screen, Section, useToast } from '@/components/ui';
import { cancelBill, fetchBill, markPaid, money, payLinks, receiptUrl, remind, settleShare, type BillDetail, type ShareStatus } from '@/features/bills/api';
import { useAuth } from '@/lib/auth';
import { confirmThen } from '@/lib/confirm';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const STATUS: Record<ShareStatus, { label: string; tone: 'neutral' | 'primary' | 'trust' }> = {
  owed: { label: 'Owes', tone: 'neutral' },
  paid: { label: 'Says paid', tone: 'primary' },
  settled: { label: 'Paid', tone: 'trust' },
};

/** One bill: the receipt, who owes what, and ways to pay or mark it paid. */
export default function Bill() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const [bill, setBill] = useState<BillDetail | null | undefined>(undefined);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchBill(billId)
      .then((b) => {
        setBill(b);
        if (b?.receipt_path) receiptUrl(b.receipt_path).then(setReceipt, () => setReceipt(null));
      })
      .catch(() => setBill(null));
  }, [billId]);
  useFocusEffect(load);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  if (bill === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Bill" />
        <LoadingDetail />
      </View>
    );
  }
  if (!bill) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Bill" />
        <Screen>
          <EmptyState glyph="receipt" title="Bill not found" body="It may have been removed, or it isn't one you're on." />
        </Screen>
      </View>
    );
  }

  const myShare = bill.shares.find((s) => s.user_id === session?.user.id) ?? null;
  const creatorFirst = bill.creator.name.split(' ')[0];
  const links = myShare && bill.pay_to ? payLinks(bill.pay_to, myShare.amount_cents, bill.title) : [];
  const outstanding = bill.shares.filter((s) => s.status !== 'settled').reduce((a, s) => a + s.amount_cents, 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Bill" />
      <Screen>
        <View style={{ gap: t.space[1] }}>
          <AppText variant="h1">{bill.title}</AppText>
          <AppText variant="small" tone="muted">
            {bill.is_mine ? 'You paid' : `${bill.creator.name} paid`} {money(bill.total_cents + bill.tip_cents)}
            {bill.tip_cents ? ` (with ${money(bill.tip_cents)} tip)` : ''} · {bill.split === 'even' ? 'split evenly' : 'custom amounts'} · {timeAgo(bill.created_at)}
          </AppText>
          {bill.event ? (
            <AppText
              variant="small"
              tone="primary"
              weight="bold"
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(bill.event!.id) } })}>
              {bill.event.title} →
            </AppText>
          ) : null}
          {bill.canceled ? <Badge label="Canceled" tone="neutral" /> : null}
        </View>

        {myShare && !bill.canceled ? (
          <Card accent="primary">
            <View style={{ gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <AppText weight="bold">Your share</AppText>
                <AppText variant="h2">{money(myShare.amount_cents)}</AppText>
              </View>
              {myShare.status === 'settled' ? (
                <AppText tone="trust" weight="bold">
                  {creatorFirst} got it. You&apos;re all square.
                </AppText>
              ) : myShare.status === 'paid' ? (
                <AppText tone="muted">You said you paid. Waiting for {creatorFirst} to confirm.</AppText>
              ) : (
                <>
                  {links.length ? (
                    <View style={{ gap: t.space[2] }}>
                      {links.map((l) => (
                        <Button
                          key={l.key}
                          label={`Pay ${creatorFirst} with ${l.label}`}
                          variant="secondary"
                          size="md"
                          onPress={() => Linking.openURL(l.url).catch(() => toast(`Couldn’t open ${l.label}.`))}
                        />
                      ))}
                    </View>
                  ) : (
                    <AppText variant="small" tone="muted">
                      {creatorFirst} hasn&apos;t added Venmo, Cash App or PayPal yet. Pay them however you usually do.
                    </AppText>
                  )}
                  <Button label="I paid" onPress={() => run('paid', () => markPaid(bill.id), `We told ${creatorFirst}`)} loading={busy === 'paid'} />
                </>
              )}
            </View>
          </Card>
        ) : null}

        {bill.is_mine && !bill.canceled ? (
          <AppText tone="muted">
            {outstanding ? `${money(outstanding)} still to come back to you.` : 'Everyone has paid you back.'} Your own share:{' '}
            {money(bill.creator_share_cents)}.
          </AppText>
        ) : null}

        <Section title="Who owes what">
          {bill.shares.map((s) => (
            <View key={s.user_id} style={{ gap: t.space[2], paddingVertical: t.space[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <Avatar name={s.name} uri={s.avatar_url} size={38} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">{s.name}</AppText>
                  <AppText variant="caption" tone="subtle">
                    {money(s.amount_cents)}
                  </AppText>
                </View>
                <Badge label={STATUS[s.status].label} tone={STATUS[s.status].tone} />
              </View>
              {bill.is_mine && !bill.canceled && s.status !== 'settled' ? (
                <View style={{ flexDirection: 'row', gap: t.space[2], paddingLeft: 50 }}>
                  <Button
                    label="Got it"
                    size="md"
                    variant="trust"
                    accessibilityLabel={`Got ${money(s.amount_cents)} from ${s.name}`}
                    onPress={() => run(`settle-${s.user_id}`, () => settleShare(bill.id, s.user_id), `Marked ${s.name.split(' ')[0]} as paid`)}
                    loading={busy === `settle-${s.user_id}`}
                  />
                  {s.can_remind ? (
                    <Button
                      label="Remind"
                      size="md"
                      variant="ghost"
                      accessibilityLabel={`Remind ${s.name}`}
                      onPress={() => run(`remind-${s.user_id}`, () => remind(bill.id, s.user_id), `Reminded ${s.name.split(' ')[0]}`)}
                      loading={busy === `remind-${s.user_id}`}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </Section>

        {bill.receipt_path ? (
          <Section title="Receipt">
            {receipt ? (
              <Image
                source={{ uri: receipt }}
                style={{ width: '100%', height: 420, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}
                contentFit="contain"
                accessibilityLabel={`Receipt for ${bill.title}`}
              />
            ) : (
              <AppText variant="small" tone="muted">
                Loading the receipt…
              </AppText>
            )}
          </Section>
        ) : null}

        {bill.note ? <AppText tone="muted">{bill.note}</AppText> : null}

        {bill.is_mine && !bill.canceled ? (
          <View style={{ gap: t.space[2] }}>
            <GlyphTitle glyph="coin">Where friends pay you</GlyphTitle>
            <Button label="Add or change Venmo, Cash App, PayPal" variant="secondary" size="md" onPress={() => router.push('/bills/pay-me')} />
            <Button
              label="Cancel this bill"
              variant="ghost"
              size="md"
              onPress={() =>
                confirmThen('Cancel this bill?', 'Friends won’t be asked to pay it anymore.', () =>
                  run('cancel', () => cancelBill(bill.id), 'Bill canceled'),
                )
              }
            />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

