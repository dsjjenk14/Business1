import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Card, EmptyState, GlyphTile, LoadingList, Screen } from '@/components/ui';
import { fetchMyTickets, money, type MyTicket } from '@/features/payments/api';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** Tickets you've bought. */
export default function MyTickets() {
  const t = useTheme();
  const router = useRouter();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchMyTickets()
        .then(setTickets)
        .catch(() => setTickets([]));
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="My tickets" />
      <Screen contentGap={t.space[3]}>
        {tickets === null ? (
          <LoadingList rows={3} />
        ) : tickets.length === 0 ? (
          <EmptyState glyph="calendar" title="No tickets yet" body="When you buy a ticket to an event, it shows here." />
        ) : (
          tickets.map((tk) => (
            <Card key={tk.ticket_id}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${tk.title}, ${dayTime(tk.starts_at)}`}
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(tk.event_id) } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <GlyphTile name="calendar" size={44} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {tk.title}
                  </AppText>
                  <AppText variant="caption" tone="subtle" numberOfLines={1}>
                    {[dayTime(tk.starts_at), tk.place, money(tk.amount_cents)].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                {tk.status === 'paid' ? <Badge label="Ticket" glyph="check" tone="trust" /> : <Badge label={tk.status === 'refunded' ? 'Refunded' : 'Refund due'} tone="neutral" />}
              </Pressable>
            </Card>
          ))
        )}
      </Screen>
    </View>
  );
}
