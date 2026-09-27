import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { RingDiagram } from '@/components/circles/RingDiagram';
import { AppText, Badge, Button, Card, IconButton, Screen, Section, Segmented, useToast } from '@/components/ui';
import {
  fetchActivity,
  fetchCircle,
  fetchGroups,
  fetchIntros,
  joinOpenGroup,
  type Activity,
  type CircleOverview,
  type GroupRow,
  type GroupsOverview,
  type MyIntros,
} from '@/features/circles/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

type Tab = 'circle' | 'network' | 'groups';

/** Circles: My Circle, Network (one intro away), and Groups. */
export default function Circles() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { session, profile } = useAuth();
  const me = session?.user.id;

  const [tab, setTab] = useState<Tab>(params.tab ?? 'circle');
  const [circle, setCircle] = useState<CircleOverview | null>(null);
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [intros, setIntros] = useState<MyIntros | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [groups, setGroups] = useState<GroupsOverview | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [c, pc, i, a, g] = await Promise.all([fetchCircle(), fetchProfileCard(me), fetchIntros(), fetchActivity(), fetchGroups()]);
    setCircle(c);
    setCard(pc);
    setIntros(i);
    setActivity(a);
    setGroups(g);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => toast("Couldn't load your circle. Try again."));
    }, [load, toast]),
  );

  const pendingCount = (intros?.to_answer.length ?? 0) + (intros?.requests.length ?? 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
          Circles
        </AppText>
        <IconButton icon="search-outline" label="Search members" onPress={() => router.push('/search')} />
      </View>

      <Segmented<Tab>
        options={[
          { key: 'circle', label: 'My Circle' },
          { key: 'network', label: 'Network' },
          { key: 'groups', label: 'Groups' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {pendingCount > 0 ? (
        <Card accent="primary" onPress={() => router.push('/circles/intros')} accessibilityLabel={`${pendingCount} intros waiting on you`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <AppText style={{ fontSize: 24 }}>👋</AppText>
            <View style={{ flex: 1 }}>
              <AppText weight="bold">
                {pendingCount} intro{pendingCount === 1 ? '' : 's'} waiting on you
              </AppText>
              <AppText variant="small" tone="muted">
                {[
                  intros?.to_answer.length ? `${intros.to_answer.length} to accept or pass` : null,
                  intros?.requests.length ? `${intros.requests.length} asking you to connect people` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
            <AppText tone="primary" weight="bold">
              →
            </AppText>
          </View>
        </Card>
      ) : null}

      {!circle || !card ? (
        <AppText tone="subtle" align="center">
          Loading…
        </AppText>
      ) : tab === 'circle' ? (
        <MyCircle circle={circle} card={card} introsMade={intros?.made_count ?? 0} meName={profile?.display_name ?? 'You'} inviteCode={profile?.invite_code ?? ''} />
      ) : tab === 'network' ? (
        <Network circle={circle} activity={activity} />
      ) : groups ? (
        <Groups
          groups={groups}
          onJoin={async (g) => {
            if (!me) return;
            try {
              await joinOpenGroup(g.id, me);
              toast(`You joined ${g.name}`);
              setGroups(await fetchGroups());
            } catch (e) {
              toast(friendlyError(e));
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

function MyCircle({ circle, card, introsMade, meName, inviteCode }: { circle: CircleOverview; card: ProfileCard; introsMade: number; meName: string; inviteCode: string }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <>
      {circle.first.length === 0 ? (
        <Card accent="primary">
          <View style={{ gap: t.space[2] }}>
            <AppText weight="bold">Start your circle</AppText>
            <AppText variant="small" tone="muted">
              Your circle grows from people you actually know. Share your invite code: when a friend joins with it, you&apos;re connected
              automatically and you both get a vouch.
            </AppText>
            <Button
              label="Share my invite code"
              size="md"
              onPress={() => Share.share({ message: `Join me on I'm In, where trust is earned in real life. Use my invite code ${inviteCode} when you sign up.` })}
            />
          </View>
        </Card>
      ) : null}
      <RingDiagram
        me={{ id: card.id, display_name: meName, avatar_emoji: card.avatar_emoji, avatar_url: card.avatar_url }}
        first={circle.first}
        second={circle.second}
      />

      <View style={{ flexDirection: 'row', gap: t.space[3] }}>
        {[
          { n: circle.first.length, label: '1st degree', tone: 'primary' as const },
          { n: circle.second.length, label: '2nd degree', tone: 'ai' as const },
          { n: circle.vouch_count, label: 'Vouches', tone: 'trust' as const },
        ].map((s) => (
          <Card key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: t.space[3] }}>
            <AppText variant="number" tone={s.tone}>
              {s.n}
            </AppText>
            <AppText variant="label" tone="subtle">
              {s.label}
            </AppText>
          </Card>
        ))}
      </View>

      <Card accent="trust">
        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">🏅 Vouch someone you met</AppText>
          <AppText variant="small" tone="muted">
            Out with someone right now? Both of you tap Check In. Once GPS confirms you&apos;re together, you can vouch for each other.{' '}
            <AppText variant="small" tone="trust" weight="bold">
              {circle.vouches_left} vouch{circle.vouches_left === 1 ? '' : 'es'} left this month.
            </AppText>
          </AppText>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label="Check In & Vouch" variant="trust" size="md" style={{ flex: 1 }} onPress={() => router.push('/circles/vouch')} />
            <Button label="Request a vouch" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/circles/request-vouch')} />
          </View>
        </View>
      </Card>

      <Section title={`Vouches you've received (${card.vouch_count ?? 0})`}>
        {card.vouches.length === 0 ? (
          <AppText variant="small" tone="muted">
            No vouches yet. Go out, check in together, and ask.
          </AppText>
        ) : (
          card.vouches.map((v) => (
            <PersonRow
              key={`${v.voucher_id}-${v.created_at}`}
              id={v.voucher_id}
              name={`${v.display_name} vouched you`}
              emoji={v.avatar_emoji}
              avatarUrl={v.avatar_url}
              detail={v.type === 'invite' ? 'Invited you in' : `GPS confirmed${v.place ? ` · ${v.place}` : ''} · ${timeAgo(v.created_at)}`}
              right={v.word ? <Badge label={v.word} tone="trust" /> : null}
            />
          ))
        )}
      </Section>

      <Section title={`Your circle · 1st degree (${circle.first.length})`}>
        {circle.first.map((p) => (
          <PersonRow
            key={p.id}
            id={p.id}
            name={p.display_name}
            emoji={p.avatar_emoji}
            avatarUrl={p.avatar_url}
            vouches={p.vouch_count}
            ring={p.out_tonight ? 'trust' : null}
            detail={[p.top_vouch_word, p.neighborhood ?? p.city, p.out_tonight ? 'Out tonight' : null, p.source === 'intro' ? 'Met via intro' : null]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </Section>

      <Card>
        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">👋 Make an intro between two people</AppText>
          <AppText variant="small" tone="muted">
            Connect people you know. Your reputation travels with the intro.
            {introsMade ? ` You've made ${introsMade} successful intro${introsMade === 1 ? '' : 's'}.` : ''}
          </AppText>
          <Button label="Make an Intro →" size="md" onPress={() => router.push('/circles/make-intro')} />
        </View>
      </Card>
    </>
  );
}

function Network({ circle, activity }: { circle: CircleOverview; activity: Activity[] }) {
  const router = useRouter();
  const suggestions = circle.second.filter((p) => !p.requested).slice(0, 3);

  const activityText = (a: Activity) => {
    if (a.kind === 'vouch') return `${a.actor_name} vouched for ${a.subject_name}${a.detail ? ` · ${a.detail}` : ''}`;
    if (a.kind === 'connected') return `${a.actor_name} and ${a.subject_name} connected${a.detail ? ` ${a.detail}` : ''}`;
    return `${a.actor_name} is going out tonight${a.detail ? ` · ${a.detail}` : ''}`;
  };

  const requestIntro = (id: string) => router.push({ pathname: '/circles/request-intro', params: { target: id } });

  return (
    <>
      <Card>
        <AppText weight="bold">🌐 Your extended network</AppText>
        <AppText variant="small" tone="muted">
          These are the people one intro away from you. You can&apos;t message them directly: ask the friend you share for an intro. Once
          they both say yes, you can message right away.
        </AppText>
      </Card>

      {suggestions.length ? (
        <Section title="People you might click with">
          <AppText variant="caption" tone="subtle">
            Based on the friends and groups you share.
          </AppText>
          {suggestions.map((p) => (
            <PersonRow
              key={p.id}
              id={p.id}
              name={p.display_name}
              emoji={p.avatar_emoji}
              avatarUrl={p.avatar_url}
              vouches={p.vouch_count}
              detail={`${p.via.length} mutual${p.via.length === 1 ? '' : 's'}${p.shared_groups ? ` · ${p.shared_groups} shared group${p.shared_groups === 1 ? '' : 's'}` : ''}`}
              right={<Button label="Intro" size="md" onPress={() => requestIntro(p.id)} />}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Network activity">
        {activity.length === 0 ? (
          <AppText variant="small" tone="muted">
            Quiet so far. When your circle vouches, connects, or goes out, it shows here.
          </AppText>
        ) : (
          activity.slice(0, 8).map((a, i) => (
            <PersonRow
              key={`${a.kind}-${a.actor_id}-${i}`}
              id={a.actor_id}
              name={activityText(a)}
              emoji={a.actor_emoji}
              avatarUrl={a.actor_avatar}
              detail={timeAgo(a.at)}
            />
          ))
        )}
      </Section>

      <Section title={`All 2nd degree (${circle.second.length}) · one intro away`}>
        {circle.second.map((p) => (
          <PersonRow
            key={p.id}
            id={p.id}
            name={p.display_name}
            emoji={p.avatar_emoji}
            avatarUrl={p.avatar_url}
            vouches={p.vouch_count}
            detail={p.top_vouch_word ?? p.headline}
            right={
              p.requested ? (
                <AppText variant="caption" tone="subtle">
                  Requested
                </AppText>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${p.via[0]?.display_name} to introduce you to ${p.display_name}`} onPress={() => requestIntro(p.id)} hitSlop={8}>
                  <AppText variant="small" weight="bold" tone="trust">
                    Ask {p.via[0]?.display_name.split(' ')[0]} →
                  </AppText>
                </Pressable>
              )
            }
          />
        ))}
      </Section>
    </>
  );
}

function Groups({ groups, onJoin }: { groups: GroupsOverview; onJoin: (g: GroupRow) => void }) {
  const t = useTheme();
  const toast = useToast();

  const row = (g: GroupRow, mode: 'member' | 'join') => (
    <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 52 }}>
      <AppText style={{ fontSize: 26 }}>{g.emoji}</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="small" weight="bold">
          {g.name}
        </AppText>
        <AppText variant="caption" tone="subtle" numberOfLines={1}>
          {[`${g.member_count} members`, g.schedule_label, g.circle_members?.length ? `${g.circle_members[0]}${g.circle_members.length > 1 ? ` +${g.circle_members.length - 1}` : ''} from your circle` : null]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      {mode === 'member' ? (
        <Badge label="Member" tone="ai" />
      ) : g.requested ? (
        <AppText variant="caption" tone="subtle">
          Requested
        </AppText>
      ) : g.join_type === 'open' ? (
        <Button label="Join" size="md" onPress={() => onJoin(g)} />
      ) : (
        <Button label="Request" size="md" variant="secondary" onPress={() => toast('Join requests arrive with groups in Phase 4')} />
      )}
    </View>
  );

  return (
    <>
      <Section title="Your groups">{groups.mine.length ? groups.mine.map((g) => row(g, 'member')) : <AppText variant="small" tone="muted">You&apos;re not in any groups yet.</AppText>}</Section>
      {groups.from_circle.length ? <Section title="From your circle">{groups.from_circle.map((g) => row(g, 'join'))}</Section> : null}
      {groups.discover.length ? <Section title="Discover more">{groups.discover.map((g) => row(g, 'join'))}</Section> : null}
      <Card onPress={() => toast('Creating groups arrives in Phase 4')} accessibilityLabel="Create your own group">
        <AppText weight="bold">➕ Create your own group</AppText>
        <AppText variant="small" tone="muted">
          Verified members only. You control who joins.
        </AppText>
      </Card>
    </>
  );
}
