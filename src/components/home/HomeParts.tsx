import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Badge, Button, DateTile, GlyphTile, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { joinGroup } from '@/features/groups/api';
import type { HomeActivity, HomeEvent, SuggestedGroup } from '@/features/home/api';
import { money } from '@/features/payments/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const first = (name: string) => name.split(' ')[0] ?? name;

/** "Maya replied: …" or "Alex, Brianna and 7 others are in on your pin". Tap to open the pin. */
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
  const line = item.kind === 'reply' ? `${who} replied: ${item.text ?? ''}` : `${who} ${item.count === 1 ? 'is' : 'are'} in on your pin`;
  const ago = timeAgo(item.at);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${line}. On: ${item.pin_body}`}
      onPress={() => router.push({ pathname: '/pins/[id]', params: { id: String(item.pin_id) } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <Avatar name={item.actor_name} uri={item.actor_avatar} size={40} />
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
        {event.cover_url ? (
          <Image source={{ uri: event.cover_url }} style={{ width: 44, height: 44, borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceAlt }} contentFit="cover" />
        ) : (
          <DateTile iso={event.starts_at} size={44} />
        )}
        <View style={{ flex: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {event.title}
          </AppText>
          <AppText variant="caption" tone="subtle" numberOfLines={1}>
            {[dayTime(event.starts_at), event.place].filter(Boolean).join(' · ')}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {[subtitle, event.friends_going ? `${event.friends_going} Insider${event.friends_going === 1 ? '' : 's'} going` : `${event.going_count} going`]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </Pressable>
      {event.i_am_going ? (
        <Badge label="You're in" glyph="check" tone="trust" />
      ) : event.ticket_price_cents != null ? (
        <Button
          label={money(event.ticket_price_cents)}
          size="md"
          onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })}
          accessibilityLabel={`Buy tickets for ${event.title}, ${money(event.ticket_price_cents)}`}
        />
      ) : event.capacity != null && event.going_count >= event.capacity ? (
        <Button label="Waitlist" size="md" variant="secondary" onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })} />
      ) : (
        <Button label="I'm In" size="md" onPress={onIn} />
      )}
    </View>
  );
}

/** A group to join: open groups join in one tap, others go to "Request to join". */
export function GroupSuggestion({ group, onJoined }: { group: SuggestedGroup; onJoined: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const open = () => router.push({ pathname: '/groups/[id]', params: { id: String(group.id) } });

  async function join() {
    if (group.join_type !== 'open') return open();
    try {
      await joinGroup(group.id);
      toast(`You joined ${group.name}`);
      track('group_joined', { from: 'home' });
      onJoined();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56 }}>
      <Pressable accessibilityRole="link" accessibilityLabel={group.name} onPress={open} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <GlyphTile name={group.emoji} size={44} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {group.name}
          </AppText>
          <AppText variant="caption" tone="subtle" numberOfLines={1}>
            {[`${group.members} member${group.members === 1 ? '' : 's'}`, group.schedule].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </Pressable>
      <Button label={group.join_type === 'open' ? 'Join' : 'Ask to join'} size="md" variant="secondary" onPress={join} />
    </View>
  );
}
