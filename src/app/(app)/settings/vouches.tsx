import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, EmptyState, LoadingList, Screen, useToast } from '@/components/ui';
import { fetchVouchesGiven, unvouch, type VouchGiven } from '@/features/circles/api';
import { confirmThen } from '@/lib/confirm';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** Everyone you've vouched for, with a way to take a vouch back. */
export default function VouchesGiven() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<VouchGiven[] | null>(null);

  const load = useCallback(() => {
    fetchVouchesGiven()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  useFocusEffect(load);

  function takeBack(v: VouchGiven) {
    const first = v.display_name.split(' ')[0];
    confirmThen(`Take back your vouch for ${first}?`, 'It comes off their profile. It still counts toward your vouches this month.', async () => {
      try {
        await unvouch(v.user_id);
        setList((l) => (l ? l.filter((x) => x.user_id !== v.user_id) : l));
        toast(`You took back your vouch for ${first}`);
      } catch (e) {
        toast(friendlyError(e));
      }
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Vouches you gave" />
      <Screen>
        <AppText tone="muted">A vouch says you&apos;d recommend someone. If that changes, you can take it back. They aren&apos;t told.</AppText>
        {!list ? (
          <LoadingList rows={3} />
        ) : list.length === 0 ? (
          <EmptyState glyph="medal" title="No vouches yet" body="When you vouch for someone you met, they show up here." />
        ) : (
          list.map((v) => (
            <View key={v.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56 }}>
              <Avatar name={v.display_name} uri={v.avatar_url} size={44} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" onPress={() => router.push({ pathname: '/people/[id]', params: { id: v.user_id } })}>
                  {v.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {[v.last_word, v.vouches > 1 ? `${v.vouches} vouches` : null, timeAgo(v.last_at)].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Button label="Take back" variant="ghost" size="md" accessibilityLabel={`Take back your vouch for ${v.display_name}`} onPress={() => takeBack(v)} />
            </View>
          ))
        )}
      </Screen>
    </View>
  );
}
