import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Screen, useToast } from '@/components/ui';
import { fetchBlocked, unblockUser, type BlockedMember } from '@/features/safety/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function Blocked() {
  const t = useTheme();
  const toast = useToast();
  const [list, setList] = useState<BlockedMember[] | null>(null);

  const load = useCallback(() => {
    fetchBlocked().then(setList).catch(() => setList([]));
  }, []);
  useFocusEffect(load);

  async function unblock(m: BlockedMember) {
    try {
      await unblockUser(m.user_id);
      toast(`Unblocked ${m.display_name}`);
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <>
      <BackHeader title="Blocked members" />
      <Screen>
        <AppText tone="muted">
          Blocked members can&apos;t see you, message you, or find you, and you won&apos;t see them. Unblocking doesn&apos;t reconnect you.
        </AppText>
        {list?.length === 0 ? <AppText tone="subtle">You haven&apos;t blocked anyone.</AppText> : null}
        {list?.map((m) => (
          <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <Avatar name={m.display_name} emoji={m.avatar_emoji} uri={m.avatar_url} size={40} />
            <AppText weight="bold" style={{ flex: 1 }}>
              {m.display_name}
            </AppText>
            <Button label="Unblock" size="md" variant="secondary" onPress={() => unblock(m)} />
          </View>
        ))}
      </Screen>
    </>
  );
}
