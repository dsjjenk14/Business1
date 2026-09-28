import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Badge, Button, Card, GlyphTile } from '@/components/ui';
import type { HomeConnection, HomeEvent, HomeLive } from '@/features/home/api';
import { clockTime, dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** "Maya is In at Songbyrd" (or "Aaliyah and Jordan are In at Bresca"), with Join. */
export function LiveCard({ group }: { group: HomeLive[] }) {
  const t = useTheme();
  const router = useRouter();
  const [first] = group;
  if (!first) return null;
  const names = group.map((g) => g.display_name.split(' ')[0]);
  const who = names.length === 1 ? `${names[0]} is` : names.length === 2 ? `${names[0]} and ${names[1]} are` : `${names[0]}, ${names[1]} and ${names.length - 2} more are`;
  return (
    <Card accent="trust">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <View style={{ width: group.length > 1 ? 70 : 48, height: 48 }}>
          {group.slice(0, 2).map((g, i) => (
            <View key={g.id} style={{ position: 'absolute', left: i * 30, top: i * 8 }}>
              <Avatar name={g.display_name} uri={g.avatar_url} size={group.length > 1 ? 40 : 48} ring="trust" />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">
            {who} In at {first.place}
          </AppText>
          <AppText variant="small" tone="muted">
            Since {clockTime(group.map((g) => g.since).sort()[0] ?? first.since)}
          </AppText>
        </View>
        <Button label="Join" size="md" variant="trust" onPress={() => router.push('/tonight')} accessibilityLabel={`Join them at ${first.place}`} />
      </View>
    </Card>
  );
}

/** An upcoming event your circle is going to, with I'm In and Share. */
export function EventFeedCard({ event, onIn, onShare }: { event: HomeEvent; onIn: () => void; onShare: () => void }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Event: ${event.title}, ${dayTime(event.starts_at)}`}
          onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name={event.emoji ?? 'calendar'} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" weight="bold" tone="primary">
              EVENT
            </AppText>
            <AppText weight="bold">{event.title}</AppText>
            <AppText variant="small" tone="muted">
              {[dayTime(event.starts_at), event.venue_name].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </Pressable>
        <AppText variant="small" tone="trust" weight="bold">
          {event.circle_going ? `${event.circle_going} from your circle going` : `${event.going_count} going`}
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          {event.i_am_going ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Badge label="You're in" glyph="check" tone="trust" />
            </View>
          ) : (
            <Button label="I'm In" size="md" style={{ flex: 1 }} onPress={onIn} />
          )}
          <Button label="Share to my circle" size="md" variant="secondary" style={{ flex: 1 }} onPress={onShare} />
        </View>
      </View>
    </Card>
  );
}

/** "You and Alex connected · Say hi." */
export function NewConnectionCard({ person }: { person: HomeConnection }) {
  const t = useTheme();
  const router = useRouter();
  const first = person.display_name.split(' ')[0];
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Avatar name={person.display_name} uri={person.avatar_url} size={48} ring="primary" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">New in your circle: {first}</AppText>
          <AppText variant="small" tone="muted">
            Connected {timeAgo(person.since) === 'now' ? 'just now' : `${timeAgo(person.since)} ago`}
          </AppText>
        </View>
        <Button label="Say hi" size="md" variant="secondary" onPress={() => router.push({ pathname: '/people/[id]', params: { id: person.id } })} />
      </View>
    </Card>
  );
}

/** For brand-new members: the one thing to do first. */
export function FirstFriendsCard() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card accent="primary">
      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Add your first friends</AppText>
        <AppText variant="small" tone="muted">
          I&apos;m In is better with people you know. Scan a friend&apos;s code, send them a code, or invite them. Meanwhile, here&apos;s what
          everyone&apos;s posting.
        </AppText>
        <Button label="Add someone" size="md" onPress={() => router.push('/connect')} />
      </View>
    </Card>
  );
}
