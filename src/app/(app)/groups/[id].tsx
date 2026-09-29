import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  GlyphTile,
  GlyphTitle,
  IconButton,
  LoadingDetail,
  OptionsSheet,
  Screen,
  Section,
  TextField,
  useToast,
} from '@/components/ui';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import {
  fetchAnnouncement,
  fetchGroup,
  joinGroup,
  leaveGroup,
  postAnnouncement,
  reviewRequest,
  setGroupRole,
  type GroupAnnouncement,
  type GroupDetail,
} from '@/features/groups/api';
import { rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const HOW_LABEL: Record<string, string> = {
  through_member: 'Through a member',
  discovery: 'Discovery feed',
  search: 'Search',
  word_of_mouth: 'Someone told them',
};

/** A group: about, next event, members, chat, and (for admins) join requests. */
export default function Group() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [announcement, setAnnouncement] = useState<GroupAnnouncement | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [roleFor, setRoleFor] = useState<GroupDetail['members'][number] | null>(null);

  const load = useCallback(async () => {
    try {
      setGroup(await fetchGroup(Number(id)));
      setAnnouncement(await fetchAnnouncement(Number(id)).catch(() => null));
    } catch {
      setGroup(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function rsvpNext(ev: GroupDetail['next_event']) {
    if (!ev || !me) return;
    run(() => rsvp(ev.id, me).then(enableArrivalWatch), `You're in: ${ev.title}`);
  }

  function confirmLeave() {
    if (!group) return;
    const leave = () => run(() => leaveGroup(group.id), `You left ${group.name}`);
    if (Platform.OS === 'web') {
      if (window.confirm(`Leave ${group.name}? You'll also leave the group chat.`)) leave();
      return;
    }
    Alert.alert(`Leave ${group.name}?`, "You'll also leave the group chat.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  }

  if (group === undefined || !group) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Group" />
        <Screen>
          {group === undefined ? (
            <LoadingDetail />
          ) : (
            <EmptyState glyph="people" title="This group isn’t available" body="It may have been removed, or it’s private." />
          )}
        </Screen>
      </View>
    );
  }

  const isMember = !!group.my_role;
  const isAdmin = group.my_role === 'owner' || group.my_role === 'admin';
  const circleMembers = group.members.filter((m) => m.in_circle);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Group" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <GlyphTile name={group.emoji} size={64} />
          <AppText variant="h2" align="center" accessibilityRole="header">
            {group.name}
          </AppText>
          <AppText tone="muted" align="center">
            {[`${group.member_count} member${group.member_count === 1 ? '' : 's'}`, group.schedule_label, group.join_type === 'open' ? 'Open' : 'Request to join']
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>

        {isMember ? (
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            {group.conversation_id ? (
              <Button
                label="Chat"
                size="md"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(group.conversation_id) } })}
              />
            ) : null}
            {isAdmin ? (
              <Button
                label="+ Event"
                size="md"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/events/new', params: { group: String(group.id) } })}
              />
            ) : null}
          </View>
        ) : group.requested ? (
          <Card>
            <GlyphTitle glyph="mail">Request sent</GlyphTitle>
            <AppText variant="small" tone="muted">
              {group.owner.display_name} will review it. You&apos;ll get a notification when they respond.
            </AppText>
          </Card>
        ) : group.join_type === 'open' || group.invited ? (
          <Button
            label={group.invited ? 'Accept invite & join' : 'Join group'}
            onPress={() => run(() => joinGroup(group.id), `You joined ${group.name}`)}
            loading={busy}
          />
        ) : (
          <Button label="Request to Join" onPress={() => router.push({ pathname: '/groups/[id]/join', params: { id: String(group.id) } })} />
        )}

        {group.description ? <AppText>{group.description}</AppText> : null}

        {isMember && (announcement || isAdmin) ? (
          <Card accent="primary">
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph="spark">Announcement</GlyphTitle>
              {draft !== null ? (
                <>
                  <TextField label="Announcement" value={draft} onChangeText={setDraft} maxLength={500} multiline placeholder="Saturday 7am at Rock Creek. Bring water." />
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      label="Post to everyone"
                      size="md"
                      style={{ flex: 1 }}
                      disabled={!draft.trim()}
                      onPress={() =>
                        run(async () => {
                          await postAnnouncement(group.id, draft);
                          setAnnouncement({ text: draft.trim(), at: new Date().toISOString(), by: null });
                          setDraft(null);
                        }, 'Posted. Every member gets a notification.')
                      }
                    />
                    <Button label="Cancel" size="md" variant="secondary" onPress={() => setDraft(null)} />
                  </View>
                </>
              ) : announcement ? (
                <>
                  <AppText>{announcement.text}</AppText>
                  <AppText variant="caption" tone="subtle">
                    {[announcement.by, timeAgo(announcement.at) === 'now' ? 'just now' : `${timeAgo(announcement.at)} ago`].filter(Boolean).join(' · ')}
                  </AppText>
                  {isAdmin ? (
                    <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                      <Button label="New announcement" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft('')} />
                      <Button label="Remove" size="md" variant="ghost" onPress={() =>
                          run(async () => {
                            await postAnnouncement(group.id, '');
                            setAnnouncement(null);
                          }, 'Announcement removed')
                        } />
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <AppText variant="small" tone="muted">
                    Pin a message for the whole group. Every member gets a notification.
                  </AppText>
                  <Button label="Post an announcement" size="md" variant="secondary" onPress={() => setDraft('')} />
                </>
              )}
            </View>
          </Card>
        ) : null}

        {isAdmin && group.pending_requests.length ? (
          <Section title={`Join requests (${group.pending_requests.length})`}>
            {group.pending_requests.map((r) => (
              <Card key={r.id}>
                <View style={{ gap: t.space[2] }}>
                  <PersonRow id={r.user.id} name={r.user.display_name} avatarUrl={r.user.avatar_url} vouches={r.user.vouch_count} />
                  {r.why ? <AppText variant="small">“{r.why}”</AppText> : null}
                  {r.how_found ? (
                    <AppText variant="caption" tone="subtle">
                      Found it: {HOW_LABEL[r.how_found] ?? r.how_found}
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      label="Approve"
                      size="md"
                      variant="trust"
                      style={{ flex: 1 }}
                      disabled={busy}
                      onPress={() => run(() => reviewRequest(r.id, true), `${r.user.display_name} is in`)}
                    />
                    <Button
                      label="Decline"
                      size="md"
                      variant="secondary"
                      style={{ flex: 1 }}
                      disabled={busy}
                      onPress={() => run(() => reviewRequest(r.id, false), 'Request declined')}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </Section>
        ) : null}

        {group.next_event ? (
          <Section title="Next event">
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Next event: ${group.next_event.title}`}
                  onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(group.next_event?.id) } })}
                  style={{ flex: 1 }}>
                  <AppText weight="bold">{group.next_event.title}</AppText>
                  <AppText variant="small" tone="muted">
                    {[dayTime(group.next_event.starts_at), group.next_event.venue_name, `${group.next_event.going_count} going`].filter(Boolean).join(' · ')}
                  </AppText>
                </Pressable>
                {group.next_event.i_am_going ? (
                  <Badge label="You're in" glyph="check" tone="trust" />
                ) : isMember && me ? (
                  <Button label="I'm In" size="md" onPress={() => rsvpNext(group.next_event)} />
                ) : null}
              </View>
            </Card>
          </Section>
        ) : null}

        {!isMember && circleMembers.length ? (
          <AppText tone="trust" weight="bold">
            {circleMembers.length} from your Insiders {circleMembers.length === 1 ? 'is' : 'are'} in this group
          </AppText>
        ) : null}

        <Section title={`Members (${group.member_count})`}>
          {group.members.map((m) => (
            <PersonRow
              key={m.id}
              id={m.id}
              name={m.id === me ? 'You' : m.display_name}
              avatarUrl={m.avatar_url}
              vouches={m.vouch_count}
              ring={m.in_circle ? 'trust' : null}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
                  {m.role === 'owner' ? <Badge label="Owner" glyph="crown" tone="sponsored" /> : m.role === 'admin' ? <Badge label="Co-host" tone="ai" /> : null}
                  {group.my_role === 'owner' && m.id !== me ? (
                    <IconButton icon="ellipsis-horizontal" label={`Options for ${m.display_name}`} onPress={() => setRoleFor(m)} />
                  ) : null}
                </View>
              }
            />
          ))}
        </Section>

        {isMember && group.my_role !== 'owner' ? <Button label="Leave group" variant="ghost" onPress={confirmLeave} disabled={busy} /> : null}
        <OptionsSheet
          visible={!!roleFor}
          title={roleFor?.display_name}
          onClose={() => setRoleFor(null)}
          options={
            roleFor
              ? [
                  roleFor.role === 'admin'
                    ? { label: 'Remove as co-host', onPress: () => run(() => setGroupRole(group.id, roleFor.id, 'member'), `${roleFor.display_name} is a member again`) }
                    : {
                        label: 'Make co-host',
                        onPress: () => run(() => setGroupRole(group.id, roleFor.id, 'admin'), `${roleFor.display_name} is now a co-host`),
                      },
                  { label: 'View profile', onPress: () => router.push({ pathname: '/people/[id]', params: { id: roleFor.id } }) },
                ]
              : []
          }
        />
      </Screen>
    </View>
  );
}
