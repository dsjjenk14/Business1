import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Card } from '@/components/ui';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { useTheme } from '@/theme';

export default function Bookmarks() {
  const t = useTheme();
  const [pins, setPins] = useState<FeedPin[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchFeed({ mode: 'bookmarks', limit: 100 }).then((p) => !cancelled && setPins(p));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Bookmarks" />
      <FlatList
        data={pins?.filter((p) => p.bookmarked) ?? []}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <PinCard pin={item} locationMode="none" onChange={(next) => setPins((list) => list?.map((p) => (p.id === next.id ? next : p)) ?? null)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: t.space[3] }} />}
        ListHeaderComponent={
          <AppText tone="muted" style={{ marginBottom: t.space[4] }}>
            Pins you&apos;ve saved. Tap any one to revisit the thread.
          </AppText>
        }
        ListEmptyComponent={
          pins ? (
            <Card>
              <AppText weight="bold">No bookmarks yet</AppText>
              <AppText variant="small" tone="muted">
                Tap the bookmark icon on any pin to save it here.
              </AppText>
            </Card>
          ) : null
        }
        contentContainerStyle={{ padding: t.space[4], width: '100%', maxWidth: 640, alignSelf: 'center' }}
      />
    </View>
  );
}
