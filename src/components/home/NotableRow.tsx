import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { fetchNotable, type NotableMember } from '@/features/notable/api';
import { useTheme } from '@/theme';

/** Notable members: verified public figures, in their own row so "Most vouched" stays about regular members. */
export function NotableRow() {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<NotableMember[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchNotable()
        .then((p) => live && setPeople(p))
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  if (!people.length) return null;
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="h3" accessibilityRole="header">
        Notable on I’m In
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3] }}>
        {people.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name}, Notable${p.note ? `, ${p.note}` : ''}`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
            style={{ width: 84, alignItems: 'center', gap: 4 }}>
            {/* A plain white ring, like the black-and-white Notable sticker. */}
            <View style={{ padding: 3, borderRadius: 30, borderWidth: 2.5, borderColor: t.colors.text }}>
              <Avatar name={p.display_name} uri={p.avatar_url} size={70} userId={p.id} />
            </View>
            <AppText variant="small" weight="bold" numberOfLines={1}>
              {p.display_name}
            </AppText>
            {p.note ? (
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {p.note}
              </AppText>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
