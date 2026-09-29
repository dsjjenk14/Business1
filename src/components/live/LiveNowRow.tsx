import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { fetchLiveNow, useLiveEnabled, type LiveNow } from '@/features/live/api';
import { useTheme } from '@/theme';

/** Top of Home: people you can watch live right now, and a Go live button. */
export function LiveNowRow() {
  const t = useTheme();
  const router = useRouter();
  const enabled = useLiveEnabled();
  const [live, setLive] = useState<LiveNow[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      fetchLiveNow()
        .then(setLive)
        .catch(() => undefined);
    }, [enabled]),
  );

  if (!enabled) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go live"
        onPress={() => router.push('/live/new')}
        style={{ alignItems: 'center', gap: 4, width: 72 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: t.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="bold" style={{ color: t.colors.onPrimary }}>
            LIVE
          </AppText>
        </View>
        <AppText variant="caption" numberOfLines={1}>
          Go live
        </AppText>
      </Pressable>
      {live.map((l) => (
        <Pressable
          key={l.stream_id}
          accessibilityRole="link"
          accessibilityLabel={`${l.host_name} is live: ${l.title}`}
          onPress={() => router.push({ pathname: '/live/[id]', params: { id: String(l.stream_id) } })}
          style={{ alignItems: 'center', gap: 4, width: 72 }}>
          <View style={{ padding: 2, borderRadius: 34, borderWidth: 2, borderColor: t.colors.primary }}>
            <Avatar name={l.host_name} uri={l.avatar_url} size={56} userId={l.host_id} />
          </View>
          <AppText variant="caption" numberOfLines={1}>
            {l.host_name.split(' ')[0]}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}
