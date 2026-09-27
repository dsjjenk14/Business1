import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { vibeLabel, type FeedEvent, type FeedPerson } from '@/features/tonight/api';
import { clockTime, dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

const degreeLabel = (d: number) => (d === 1 ? '1st' : d === 2 ? '2nd' : null);

/** One person going out: where, when, vibe. Your own row lets you edit or end. */
export function GoingOutPersonRow({ person, weekend, onEditMine }: { person: FeedPerson; weekend: boolean; onEditMine: () => void }) {
  const detail = [
    person.place,
    person.neighborhood,
    weekend ? dayTime(person.starts_at) : clockTime(person.starts_at),
    person.vibes.slice(0, 2).map(vibeLabel).join(', ') || null,
    person.distance_mi != null && !person.is_me ? `${person.distance_mi} mi` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const degree = degreeLabel(person.degree);
  return (
    <PersonRow
      id={person.user_id}
      name={person.is_me ? 'You' : person.display_name}
      emoji={person.avatar_emoji}
      avatarUrl={person.avatar_url}
      vouches={person.vouch_count}
      ring={person.degree === 1 ? 'trust' : person.degree === 2 ? 'ai' : null}
      detail={person.note ? `${detail}${detail ? ' · ' : ''}“${person.note}”` : detail}
      right={
        person.is_me ? (
          <Button label="Edit" size="md" variant="secondary" onPress={onEditMine} />
        ) : person.is_hosting ? (
          <Badge label="Host" tone="primary" />
        ) : degree ? (
          <Badge label={degree} tone={person.degree === 1 ? 'trust' : 'ai'} />
        ) : null
      }
    />
  );
}

/** An event card with RSVP. */
export function EventCard({ event, weekend, onRsvp }: { event: FeedEvent; weekend: boolean; onRsvp: (e: FeedEvent) => void }) {
  const t = useTheme();
  const router = useRouter();
  const spotsLeft = event.capacity != null ? Math.max(0, event.capacity - event.going_count) : null;
  const detail = [
    `${event.host_name} hosting`,
    weekend ? dayTime(event.starts_at) : clockTime(event.starts_at),
    spotsLeft != null ? (spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`) : `${event.going_count} going`,
    event.neighborhood ?? event.venue_name,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })}
      accessibilityLabel={`${event.title}. ${detail}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <AppText style={{ fontSize: 26 }}>{event.emoji ?? '📅'}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="bold">
            {event.title}
            {event.venue_name && !event.title.includes(event.venue_name) ? ` @ ${event.venue_name}` : ''}
          </AppText>
          <AppText variant="caption" tone="subtle">
            {detail}
          </AppText>
          {event.network_going > 0 ? (
            <AppText variant="caption" tone="trust">
              {event.network_going} from your network going
            </AppText>
          ) : null}
        </View>
        {event.i_am_going ? (
          <Badge label="Going" tone="trust" />
        ) : spotsLeft === 0 ? null : (
          <Button label="RSVP" size="md" onPress={() => onRsvp(event)} />
        )}
      </View>
    </Card>
  );
}

export function EmptyCard({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">{title}</AppText>
        <AppText variant="small" tone="muted">
          {body}
        </AppText>
        {action ? <Button label={action.label} size="md" variant="secondary" onPress={action.onPress} /> : null}
      </View>
    </Card>
  );
}
