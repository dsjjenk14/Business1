import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Badge, Button, GlyphTile } from '@/components/ui';
import type { HomeActivity, HomeEvent } from '@/features/home/api';
import { dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const first = (name: string) => name.split(' ')[0] ?? name;

/** "Maya replied: …" or "Alex, Brianna and 7 others liked your pin". Tap to open the pin. */
export function ActivityRow({ item }: { item: HomeActivity }) {
  const t = useTheme();
  const router = useRouter();
  const who =
    item.kind === 'reply'
      ? first(item.actor_name)
      : item.count === 1
        ? first(item.actor_name)
        : item.count === 2 && item.second_name
          ? `${first(item.actor_name)} and ${first(item.second_name)}`
          : `${first(item.actor_name)}${item.second_name ? `, ${first(item.second_name)}` : ''} and ${item.count - (item.second_name ? 2 : 1)} others`;
  const line = item.kind === 'reply' ? `${who} replied: ${item.text ?? ''}` : `${who} liked your pin`;
  const ago = timeAgo(item.at);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${line}. On: ${item.pin_body}`}
      onPress={() => router.push({ pathname: '/pins/[id]', params: { id: String(item.pin_id) } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <Avatar name={item.actor_name} uri={item.actor_avatar} size={40} ring={item.kind === 'like' ? 'primary' : 'ai'} />
      <View style={{ flex: 1 }}>
        <AppText variant="small" numberOfLines={2}>
          <AppText variant="small" weight="bold">
            {line}
          </AppText>
        </AppText>
        <AppText variant="caption" tone="subtle" numberOfLines={1}>
          {ago === 'now' ? 'just now' : ago} · {item.pin_body}
        </AppText>
      </View>
    </Pressable>
  );
}

/** One event: what, when, where, who's going, and I'm In. */
export function EventRow({ event, subtitle, onIn }: { event: HomeEvent; subtitle: string | null; onIn: () => void }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 60 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}, ${dayTime(event.starts_at)}`}
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <GlyphTile name={event.emoji ?? 'calendar'} size={44} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {event.title}
          </AppText>
          <AppText variant="caption" tone="subtle" numberOfLines={1}>
            {[dayTime(event.starts_at), event.place].filter(Boolean).join(' · ')}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {[subtitle, event.friends_going ? `${event.friends_going} friend${event.friends_going === 1 ? '' : 's'} going` : `${event.going_count} going`]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </Pressable>
      {event.i_am_going ? (
        <Badge label="You're in" glyph="check" tone="trust" />
      ) : event.capacity != null && event.going_count >= event.capacity ? (
        <Badge label="Full" tone="neutral" />
      ) : (
        <Button label="I'm In" size="md" onPress={onIn} />
      )}
    </View>
  );
}
