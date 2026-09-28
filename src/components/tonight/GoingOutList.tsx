import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { AppText, Badge, Button, Card, Chip, GlyphTile } from '@/components/ui';
import { vibeLabel, type Company, type FeedEvent, type FeedPerson } from '@/features/tonight/api';
import { clockTime, dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

const degreeLabel = (d: number) => (d === 1 ? '1st' : d === 2 ? '2nd' : null);

/** "There now · since 9:10 PM" with a live dot. */
export function HereNow({ since, compact }: { since: string; compact?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.trust }} />
      <AppText variant="caption" weight="bold" tone="trust">
        {compact ? 'There now' : `There now · since ${clockTime(since)}`}
      </AppText>
    </View>
  );
}

/**
 * Someone going out. Shows where, when and vibe, plus "There now" once their
 * phone's GPS shows them at the place. People you know can tap Join.
 */
export function GoingOutPersonRow({
  person,
  weekend,
  onJoin,
}: {
  person: FeedPerson;
  weekend: boolean;
  onJoin: (p: FeedPerson, status: 'heading' | null) => void;
}) {
  const t = useTheme();
  const detail = [
    person.place,
    person.neighborhood,
    person.here_since ? null : weekend ? dayTime(person.starts_at) : clockTime(person.starts_at),
    person.vibes.slice(0, 2).map(vibeLabel).join(', ') || null,
    person.distance_mi != null ? `${person.distance_mi} mi` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const degree = degreeLabel(person.degree);
  const company = person.heading_count + person.joined_here_count;
  const canJoin = person.open_to_join && !weekend && (person.degree === 1 || person.degree === 2);
  return (
    <PersonRow
      id={person.user_id}
      name={person.display_name}
      avatarUrl={person.avatar_url}
      vouches={person.vouch_count}
      ring={person.here_since ? 'trust' : person.degree === 1 ? 'trust' : person.degree === 2 ? 'ai' : null}
      detail={person.note ? `${detail}${detail ? ' · ' : ''}“${person.note}”` : detail}
      extra={
        person.here_since || company > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], marginTop: 2 }}>
            {person.here_since ? <HereNow since={person.here_since} /> : null}
            {company > 0 ? (
              <AppText variant="caption" tone="muted">
                {company} joining
              </AppText>
            ) : null}
          </View>
        ) : null
      }
      right={
        canJoin ? (
          person.my_join ? (
            <Button label="Joining" size="md" variant="trust" onPress={() => onJoin(person, null)} accessibilityHint="Tap to cancel" />
          ) : (
            <Button label="Join" size="md" variant="secondary" onPress={() => onJoin(person, 'heading')} />
          )
        ) : person.is_hosting ? (
          <Badge label="Host" tone="primary" />
        ) : degree ? (
          <Badge label={degree} tone={person.degree === 1 ? 'trust' : 'ai'} />
        ) : null
      }
    />
  );
}

/**
 * Your night out. When your GPS shows you at the place, the app marks you
 * there and the people you choose (your friends, or friends of friends) see
 * "There now". It stays on while you're there and turns off after a few hours.
 */
export function MyNightOut({
  me,
  company,
  minutesLeft,
  busy,
  onIn,
  onEdit,
  onAudience,
}: {
  me: FeedPerson;
  company: Company[];
  /** Minutes until "There now" turns off (computed by the screen when it loads). */
  minutesLeft: number | null;
  busy: boolean;
  onIn: () => void;
  onEdit: () => void;
  onAudience: (a: 'circle' | 'network' | 'custom') => void;
}) {
  const t = useTheme();
  const live = !!me.here_since;
  const names = (list: Company[]) => list.map((c) => c.display_name.split(' ')[0]).join(', ');
  const joining = company.filter((c) => c.status === 'heading');
  const inToo = company.filter((c) => c.status === 'here');
  const audience = me.here_audience ?? 'circle';
  return (
    <Card accent={live ? 'trust' : 'primary'}>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name={live ? 'live' : 'moon'} size={44} tone={live ? 'trust' : 'primary'} />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">{live ? "You're there" : 'Your night out'}</AppText>
            <AppText variant="small" tone="muted" numberOfLines={2}>
              {[me.place, live && me.here_since ? `since ${clockTime(me.here_since)}` : clockTime(me.starts_at)].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </View>
        {company.length ? (
          <AppText variant="small" tone="trust" weight="bold">
            {[joining.length ? `${names(joining)} ${joining.length === 1 ? 'is' : 'are'} joining you` : null, inToo.length ? `${names(inToo)} in too` : null]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        ) : null}
        {live ? (
          <AppText variant="caption" tone="subtle">
            Your phone&apos;s GPS marked you there. It stays on while you&apos;re there{minutesLeft != null ? ` (at least ${Math.max(minutesLeft, 0)} more min)` : ''}.
          </AppText>
        ) : (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" tone="muted">
              {me.venue_id
                ? `When you get to ${me.place ?? 'the place'}, the app notices and marks you there. No need to tap anything.`
                : 'Pick a place from the list (Edit plans) and the app will mark you there when you arrive.'}
            </AppText>
            <Button label="I'm here" size="md" variant="secondary" onPress={onIn} loading={busy} />
          </View>
        )}
        <View style={{ gap: t.space[2] }}>
          <AppText variant="caption" tone="subtle">
            {live ? 'Who sees you’re there' : 'When you get there, who sees it'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Chip label="Friends" selected={audience === 'circle'} onPress={() => onAudience('circle')} />
            <Chip label="Friends of friends" selected={audience === 'network'} onPress={() => onAudience('network')} />
            <Chip label="Only these people" selected={audience === 'custom'} onPress={() => onAudience('custom')} />
          </View>
          <AppText variant="caption" tone="subtle">
            Only the place is shown, never your exact location. Strangers never see it.
          </AppText>
        </View>
        <Button label="Edit plans" size="md" variant="secondary" onPress={onEdit} disabled={busy} />
      </View>
    </Card>
  );
}

/** An event card with an "I'm In" button. */
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
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${event.title}. ${detail}`}
          onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name={event.emoji ?? 'calendar'} size={40} />
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
                {event.network_going} people you know going
              </AppText>
            ) : null}
          </View>
        </Pressable>
        {event.i_am_going ? (
          <Badge label="You're in" glyph="check" tone="trust" />
        ) : spotsLeft === 0 ? null : (
          <Button label="I'm In" size="md" onPress={() => onRsvp(event)} />
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
