import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar, Glyph } from '@/components/ui';
import { fetchFamous, type FamousMember } from '@/features/milestones/api';
import { useTheme } from '@/theme';

/** Famous on I'm In: members with 1,000+ vouches. Hidden until there's someone to show. */
export function FamousRow() {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<FamousMember[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchFamous()
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Glyph name="star" size={18} color={t.colors.secondary} strokeWidth={2.4} />
        <AppText variant="h3" accessibilityRole="header">
          Famous on I&apos;m In
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3] }}>
        {people.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name}, ${p.vouch_count.toLocaleString()} vouches`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
            style={{ width: 84, alignItems: 'center', gap: 4 }}>
            <View style={{ padding: 3, borderRadius: 30, borderWidth: 2.5, borderColor: t.colors.secondary }}>
              <Avatar name={p.display_name} uri={p.avatar_url} size={70} userId={p.id} />
            </View>
            <AppText variant="small" weight="bold" numberOfLines={1}>
              {p.display_name.split(' ')[0]}
            </AppText>
            <AppText variant="caption" tone="muted">
              {p.vouch_count.toLocaleString()} vouches
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
