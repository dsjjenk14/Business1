import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, LoadingList, Screen, Section } from '@/components/ui';
import { fetchMyBills, money, type BillSummary } from '@/features/bills/api';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** Split the bill: what you're owed and what you owe. */
export default function Bills() {
  const t = useTheme();
  const router = useRouter();
  const [bills, setBills] = useState<BillSummary[] | null>(null);

  const load = useCallback(() => {
    fetchMyBills()
      .then(setBills)
      .catch(() => setBills([]));
  }, []);
  useFocusEffect(load);

  const open = (b: BillSummary) => router.push({ pathname: '/bills/[id]', params: { id: String(b.id) } });
  const live = (bills ?? []).filter((b) => !b.canceled);
  const iOwe = live.filter((b) => !b.is_mine && b.my_status !== 'settled');
  const owedToMe = live.filter((b) => b.is_mine && b.outstanding_cents > 0);
  const done = (bills ?? []).filter((b) => !iOwe.includes(b) && !owedToMe.includes(b)).slice(0, 20);

  const row = (b: BillSummary) => (
    <Card key={b.id} onPress={() => open(b)} accessibilityLabel={`${b.title}. ${summary(b)}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {b.title}
          </AppText>
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {summary(b)} · {timeAgo(b.created_at)}
          </AppText>
        </View>
        {b.canceled ? (
          <Badge label="Canceled" tone="neutral" />
        ) : !b.is_mine && b.my_status === 'owed' ? (
          <AppText weight="bold" tone="primary">
            {money(b.my_amount_cents ?? 0)}
          </AppText>
        ) : b.is_mine && b.outstanding_cents > 0 ? (
          <AppText weight="bold" tone="trust">
            +{money(b.outstanding_cents)}
          </AppText>
        ) : (
          <Badge label="Square" tone="trust" />
        )}
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Split the bill" />
      <Screen>
        <Button label="Split a bill" onPress={() => router.push('/bills/new')} />
        <Button label="Where people pay you" variant="secondary" size="md" onPress={() => router.push('/bills/pay-me')} />
        {!bills ? (
          <LoadingList rows={3} />
        ) : bills.length === 0 ? (
          <EmptyState
            glyph="receipt"
            title="No bills yet"
            body="Picked up the check? Snap the receipt, tag who was there, and everyone gets their share."
          />
        ) : (
          <>
            {iOwe.length ? <Section title="You owe">{iOwe.map(row)}</Section> : null}
            {owedToMe.length ? <Section title="Owed to you">{owedToMe.map(row)}</Section> : null}
            {done.length ? <Section title="Settled">{done.map(row)}</Section> : null}
          </>
        )}
      </Screen>
    </View>
  );
}

function summary(b: BillSummary) {
  if (b.canceled) return b.is_mine ? 'You canceled it' : `${b.creator_name} canceled it`;
  if (b.is_mine) return `${b.settled} of ${b.people} paid you back`;
  if (b.my_status === 'settled') return `You paid ${b.creator_name}`;
  if (b.my_status === 'paid') return `Waiting for ${b.creator_name} to confirm`;
  return `${b.creator_name} paid`;
}
