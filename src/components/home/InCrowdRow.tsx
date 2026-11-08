import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar, Glyph } from '@/components/ui';
import { fetchInCrowd, type InCrowdMember } from '@/features/inCrowd/api';
import { useTheme } from '@/theme';

/** The In Crowd: verified public figures, in their own row so "Most vouched" stays about regular members. */
export function InCrowdRow() {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<InCrowdMember[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchInCrowd()
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
        The In Crowd
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[3] }}>
        {people.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name}, In Crowd${p.note ? `, ${p.note}` : ''}`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
            style={{ width: 84, alignItems: 'center', gap: 4 }}>
            <View>
              <Avatar name={p.display_name} uri={p.avatar_url} size={70} userId={p.id} />
              {/* The In Crowd sticker in miniature: black, white ring, red star. */}
              <View
                style={{
                  position: 'absolute',
                  right: -6,
                  bottom: -4,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#0C0C0C',
                  borderWidth: 2,
                  borderColor: '#F5F5F5',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Glyph name="star" size={14} color={t.colors.primary} strokeWidth={2.6} />
              </View>
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
