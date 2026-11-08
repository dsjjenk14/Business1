import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, EmptyState, LoadingList, Screen, useToast } from '@/components/ui';
import { fetchInsiderRequests, respondInsiderRequest, type InsiderRequest } from '@/features/connect/contactsOnApp';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** People who have your number and want to be Insiders. */
export default function InsiderRequests() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<InsiderRequest[] | null>(null);

  const load = useCallback(() => {
    fetchInsiderRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);
  useFocusEffect(load);

  async function answer(r: InsiderRequest, accept: boolean) {
    try {
      await respondInsiderRequest(r.from_id, accept);
      toast(accept ? `You and ${r.display_name} are Insiders` : 'Declined. They aren’t told.');
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Insider requests" />
      <Screen>
        {requests === null ? (
          <LoadingList />
        ) : requests.length === 0 ? (
          <EmptyState glyph="people" title="No requests" body="When someone who has your number asks to be Insiders, it shows up here." />
        ) : (
          requests.map((r) => (
            <Card key={r.from_id}>
              <View style={{ gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <Avatar name={r.display_name} uri={r.avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" accessibilityRole="link" onPress={() => router.push({ pathname: '/people/[id]', params: { id: r.from_id } })}>
                      {r.display_name}
                    </AppText>
                    <AppText variant="caption" tone="subtle">
                      {r.vouch_count} {r.vouch_count === 1 ? 'vouch' : 'vouches'} · You&apos;re in each other&apos;s contacts
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Button label="Accept" size="md" variant="trust" style={{ flex: 1 }} onPress={() => answer(r, true)} />
                  <Button label="Decline" size="md" variant="ghost" style={{ flex: 1 }} onPress={() => answer(r, false)} />
                </View>
              </View>
            </Card>
          ))
        )}
      </Screen>
    </View>
  );
}
