import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { HomePerson } from '@/features/home/api';
import { useTheme } from '@/theme';

const SIZE = 60;

/**
 * The row of people at the top of Home (like stories): you first (post, or
 * say you're In tonight), then people you know who are In somewhere right
 * now, going out tonight, or posted today.
 */
export function PeopleRow({
  me,
  people,
  outTonight,
}: {
  me: { name: string; avatarUrl: string | null };
  people: HomePerson[];
  outTonight: boolean;
}) {
  const t = useTheme();
  const router = useRouter();

  const bubble = (key: string, label: string, sub: string | null, onPress: () => void, avatar: React.ReactNode, a11y: string) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={{ width: SIZE + 12, alignItems: 'center', gap: 4 }}>
      {avatar}
      <AppText variant="caption" weight="bold" numberOfLines={1} align="center">
        {label}
      </AppText>
      {sub ? (
        <AppText variant="caption" tone="subtle" numberOfLines={1} align="center" style={{ marginTop: -4 }}>
          {sub}
        </AppText>
      ) : null}
    </Pressable>
  );

  const ringFor = (kind: HomePerson['kind']) => (kind === 'in' ? 'trust' : kind === 'out' ? 'primary' : 'ai');

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2], paddingVertical: t.space[1] }}>
      {bubble(
        'me',
        'Post',
        null,
        () => router.push('/pins/new'),
        <View>
          <Avatar name={me.name} uri={me.avatarUrl} size={SIZE} />
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: t.colors.primary,
              borderWidth: 2,
              borderColor: t.colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="add" size={14} color={t.colors.onPrimary} />
          </View>
        </View>,
        'Post something',
      )}
      {bubble(
        'in',
        outTonight ? "You're In" : "I'm In",
        'tonight',
        () => router.push(outTonight ? '/tonight' : { pathname: '/tonight/post', params: { when: 'tonight' } }),
        <View
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: outTonight ? t.colors.trust : t.colors.primary,
          }}>
          <Ionicons name={outTonight ? 'checkmark' : 'moon'} size={24} color={outTonight ? t.colors.onTrust : t.colors.onPrimary} />
        </View>,
        outTonight ? "You're In tonight. Open Tonight" : "I'm In tonight: tell your people you're going out",
      )}
      {people.map((p) =>
        bubble(
          p.id,
          p.display_name.split(' ')[0] ?? p.display_name,
          p.kind === 'in' ? 'There now' : p.kind === 'out' ? (p.place ?? 'Tonight') : 'New post',
          () => router.push({ pathname: '/people/[id]', params: { id: p.id } }),
          <Avatar name={p.display_name} uri={p.avatar_url} size={SIZE} ring={ringFor(p.kind)} />,
          `${p.display_name}: ${p.kind === 'in' ? `there now${p.place ? ` at ${p.place}` : ''}` : p.kind === 'out' ? `going out tonight${p.place ? ` to ${p.place}` : ''}` : 'posted today'}`,
        ),
      )}
    </ScrollView>
  );
}
