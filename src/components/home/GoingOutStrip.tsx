import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar, Section } from '@/components/ui';
import type { TonightPerson } from '@/features/tonight/api';
import { useTheme } from '@/theme';

/** "Going Out Tonight": Go Live first, then people in your network who are out tonight. */
export function GoingOutStrip({ people, amLive }: { people: TonightPerson[]; amLive: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const others = people.filter((p) => !p.is_me);

  return (
    <Section title="Going out tonight" action={{ label: 'See all', onPress: () => router.push('/tonight') }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[4], paddingRight: t.space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={amLive ? "You're live tonight. Change or end" : 'Go live: tell your network you are going out tonight'}
          onPress={() => router.push({ pathname: '/tonight/post', params: { when: 'tonight' } })}
          style={{ alignItems: 'center', gap: 6, width: 64 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: amLive ? t.colors.trust : t.colors.primary,
            }}>
            <AppText weight="bold" style={{ color: amLive ? t.colors.onTrust : t.colors.onPrimary, fontSize: 12, lineHeight: 14, textAlign: 'center' }}>
              {amLive ? "I'm\nOut" : 'Go\nLive'}
            </AppText>
          </View>
          <AppText variant="caption" tone={amLive ? 'trust' : 'muted'} numberOfLines={1}>
            {amLive ? 'Live' : 'You'}
          </AppText>
        </Pressable>
        {others.map((p) => (
          <Pressable
            key={p.user_id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name}${p.place ? `, going to ${p.place}` : ', going out tonight'}`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.user_id } })}
            style={{ alignItems: 'center', gap: 6, width: 64 }}>
            <Avatar name={p.display_name} emoji={p.avatar_emoji} uri={p.avatar_url} size={56} ring={p.degree === 1 ? 'trust' : 'ai'} />
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {p.display_name.split(' ')[0]}
            </AppText>
          </Pressable>
        ))}
        {others.length === 0 ? (
          <View style={{ justifyContent: 'center', maxWidth: 220 }}>
            <AppText variant="small" tone="subtle">
              Nobody in your network has gone live yet tonight.
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </Section>
  );
}
