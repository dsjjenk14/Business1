import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { fetchCircle, type CircleOverview } from '@/features/circles/api';
import { useTheme } from '@/theme';

/**
 * Top of Home: "Your Out" first, then your Insiders, people who are out
 * tonight first with a red ring. Tap someone to see their profile.
 */
export function StoriesRow() {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<CircleOverview['first']>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchCircle()
        .then((c) => live && setPeople([...c.first].sort((a, b) => Number(b.out_tonight) - Number(a.out_tonight)).slice(0, 15)))
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  const size = 62;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3], paddingVertical: t.space[1] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Post your Out"
        onPress={() => router.push('/outs/new')}
        style={{ width: size + 4, alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.34),
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: t.colors.borderStrong,
            backgroundColor: t.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText variant="h1" tone="primary">
            +
          </AppText>
        </View>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          Your Out
        </AppText>
      </Pressable>
      {people.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.display_name}${p.out_tonight ? ', out tonight' : ''}`}
          onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
          style={{ width: size + 4, alignItems: 'center', gap: 6 }}>
          <Avatar name={p.display_name} uri={p.avatar_url} size={size} userId={p.id} ring={p.out_tonight ? 'primary' : null} />
          <AppText variant="caption" tone={p.out_tonight ? 'text' : 'muted'} numberOfLines={1}>
            {p.display_name.split(' ')[0]}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}
