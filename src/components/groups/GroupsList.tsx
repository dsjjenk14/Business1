import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Badge, Button, Card, GlyphTile, GlyphTitle, Section, useToast } from '@/components/ui';
import { fetchGroups, type GroupRow, type GroupsOverview } from '@/features/circles/api';
import { joinGroup } from '@/features/groups/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Your groups, groups your Insiders are in, and more to discover. Used on Circles and Tonight. */
export function GroupsList({ groups, onChange }: { groups: GroupsOverview; onChange: (g: GroupsOverview) => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();

  const open = (g: GroupRow) => router.push({ pathname: '/groups/[id]', params: { id: String(g.id) } });

  async function join(g: GroupRow) {
    try {
      await joinGroup(g.id);
      toast(`You joined ${g.name}`);
      onChange(await fetchGroups());
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  const row = (g: GroupRow, mode: 'member' | 'join') => (
    <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 52 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${g.name}, ${g.member_count} members`}
        onPress={() => open(g)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <GlyphTile name={g.emoji} size={40} />
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="bold">
            {g.name}
          </AppText>
          <AppText variant="caption" tone="subtle" numberOfLines={1}>
            {[
              `${g.member_count} member${g.member_count === 1 ? '' : 's'}`,
              g.schedule_label,
              g.circle_members?.length ? `${g.circle_members[0]}${g.circle_members.length > 1 ? ` +${g.circle_members.length - 1}` : ''} from your Insiders` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </Pressable>
      {mode === 'member' ? (
        <Badge label="Member" tone="ai" />
      ) : g.requested ? (
        <AppText variant="caption" tone="subtle">
          Requested
        </AppText>
      ) : g.join_type === 'open' ? (
        <Button label="Join" size="md" onPress={() => join(g)} />
      ) : (
        <Button
          label="Request"
          size="md"
          variant="secondary"
          onPress={() => router.push({ pathname: '/groups/[id]/join', params: { id: String(g.id) } })}
        />
      )}
    </View>
  );

  return (
    <>
      <Section title="Your groups">
        {groups.mine.length ? (
          groups.mine.map((g) => row(g, 'member'))
        ) : (
          <AppText variant="small" tone="muted">
            You&apos;re not in any groups yet.
          </AppText>
        )}
      </Section>
      {groups.from_circle.length ? <Section title="From your Insiders">{groups.from_circle.map((g) => row(g, 'join'))}</Section> : null}
      {groups.discover.length ? <Section title="Discover more">{groups.discover.map((g) => row(g, 'join'))}</Section> : null}
      <Card onPress={() => router.push('/groups/new')} accessibilityLabel="Create your own group">
        <GlyphTitle glyph="plus">Create your own group</GlyphTitle>
        <AppText variant="small" tone="muted">
          Give your people a home base. You control who joins.
        </AppText>
      </Card>
    </>
  );
}
