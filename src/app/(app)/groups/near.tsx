import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Chip, EmptyState, GlyphTile, isGlyphName, LoadingList, Screen, Section } from '@/components/ui';
import { GROUP_CATEGORIES, fetchGroupsNearYou, type GroupCategory, type NearbyGroup } from '@/features/groups/api';
import { useTheme } from '@/theme';

/** Groups in your city, by category. Beginner friendly groups come first. */
export default function GroupsNearYou() {
  const t = useTheme();
  const router = useRouter();
  const [groups, setGroups] = useState<NearbyGroup[] | null>(null);
  const [category, setCategory] = useState<GroupCategory | null>(null);
  const [beginners, setBeginners] = useState(false);

  const load = useCallback(() => {
    fetchGroupsNearYou(category)
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [category]);
  useFocusEffect(load);

  const shown = (groups ?? []).filter((g) => !beginners || g.beginner_friendly);
  const byCategory = GROUP_CATEGORIES.map((c) => ({ ...c, groups: shown.filter((g) => g.category === c.key) })).filter((c) => c.groups.length);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Groups near you" />
      <Screen>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          <Chip label="Beginner friendly" selected={beginners} onPress={() => setBeginners((b) => !b)} />
          <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
          {GROUP_CATEGORIES.map((c) => (
            <Chip key={c.key} label={c.label} glyph={c.glyph} selected={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} />
          ))}
        </View>
        {groups === null ? (
          <LoadingList />
        ) : byCategory.length === 0 ? (
          <EmptyState glyph="people" title="No groups here yet" body="Start one. Run clubs, supper clubs and gym crews are a great way in." action={{ label: 'Start a group', onPress: () => router.push('/groups/new') }} />
        ) : (
          byCategory.map((c) => (
            <Section key={c.key} title={c.label}>
              {c.groups.map((g) => (
                <Pressable
                  key={g.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${g.name}, ${g.member_count} members${g.beginner_friendly ? ', beginner friendly' : ''}`}
                  onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(g.id) } })}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
                  <GlyphTile name={isGlyphName(g.emoji) ? g.emoji : 'people'} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {g.name}
                    </AppText>
                    <AppText variant="caption" tone="subtle" numberOfLines={1}>
                      {[`${g.member_count} members`, g.schedule_label, g.insiders_in ? `${g.insiders_in} of your Insiders` : null, g.is_member ? 'You’re in' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  </View>
                  {g.beginner_friendly ? <Badge label="Beginner friendly" tone="trust" /> : null}
                </Pressable>
              ))}
            </Section>
          ))
        )}
      </Screen>
    </View>
  );
}
