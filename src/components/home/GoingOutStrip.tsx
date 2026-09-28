import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Avatar, Section } from '@/components/ui';
import type { TonightPerson } from '@/features/tonight/api';
import { useTheme } from '@/theme';

/** "Going out tonight": your I'm In button first, then people in your network who are out (people who are in now first). */
export function GoingOutStrip({ people, amLive }: { people: TonightPerson[]; amLive: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const others = people.filter((p) => !p.is_me).sort((a, b) => Number(!!b.here_since) - Number(!!a.here_since));
  const meHere = !!people.find((p) => p.is_me)?.here_since;

  return (
    <Section title="Going out tonight" action={{ label: 'See all', onPress: () => router.push('/tonight') }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[4], paddingRight: t.space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={amLive ? "You're out tonight. Open Tonight" : "I'm In: tell your network you're going out tonight"}
          onPress={() => (amLive ? router.push('/tonight') : router.push({ pathname: '/tonight/post', params: { when: 'tonight' } }))}
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
              {"I'm\nIn"}
            </AppText>
          </View>
          <AppText variant="caption" tone={amLive ? 'trust' : 'muted'} numberOfLines={1}>
            {meHere ? 'There now' : amLive ? 'Tonight' : 'You'}
          </AppText>
        </Pressable>
        {others.map((p) => (
          <Pressable
            key={p.user_id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name}${p.here_since ? ', in now' : ''}${p.place ? ` at ${p.place}` : ', going out tonight'}`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.user_id } })}
            style={{ alignItems: 'center', gap: 6, width: 64 }}>
            <View>
              <Avatar name={p.display_name} uri={p.avatar_url} size={56} ring={p.here_since || p.degree === 1 ? 'trust' : 'ai'} />
              {p.here_since ? (
                <View
                  style={{
                    position: 'absolute',
                    right: 1,
                    bottom: 1,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: t.colors.trust,
                    borderWidth: 2,
                    borderColor: t.colors.bg,
                  }}
                />
              ) : null}
            </View>
            <AppText variant="caption" tone={p.here_since ? 'trust' : 'muted'} numberOfLines={1}>
              {p.here_since ? 'There now' : p.display_name.split(' ')[0]}
            </AppText>
          </Pressable>
        ))}
        {others.length === 0 ? (
          <View style={{ justifyContent: 'center', maxWidth: 220 }}>
            <AppText variant="small" tone="subtle">
              Nobody in your network is out yet tonight.
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </Section>
  );
}
