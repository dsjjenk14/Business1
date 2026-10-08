import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { AppText, Avatar, Card, EmptyState, IconButton, LoadingList, Section, useToast } from '@/components/ui';
import { deleteOut, fetchOutEvent, fetchOutsInbox, type OutEvent, type OutsInbox } from '@/features/outs/api';
import { refreshNewOuts } from '@/features/outs/useNewOuts';
import { useAuth } from '@/lib/auth';
import { confirmThen } from '@/lib/confirm';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme, fontStyle } from '@/theme';

/**
 * Outs: photos that disappear after 6, 12 or 24 hours (the sender picks). Send
 * one to your Insiders or post it to your Out (your Insiders, or your network).
 * Pinning an Out keeps it; the person who took it is told. You can delete an
 * Out you sent at any time.
 */
export default function Outs() {
  const t = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const [inbox, setInbox] = useState<OutsInbox | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The I'm In event you're at, if any: its name goes on your Outs.
  const [event, setEvent] = useState<OutEvent | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, e] = await Promise.all([fetchOutsInbox(), fetchOutEvent().catch(() => null)]);
      setInbox(i);
      setEvent(e);
      refreshNewOuts();
    } catch {
      setInbox((i) => i ?? { received: [], stories: [], my_story: [], sent: [], pinned: [] });
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const view = (ids: number[]) => router.push({ pathname: '/outs/view', params: { ids: ids.join(',') } });

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.space[4], gap: t.space[6], paddingBottom: t.space[8], width: '100%', maxWidth: 640, alignSelf: 'center' }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={t.colors.primary}
        />
      }>
      {/* OUT: one big button, straight to the camera. Tap for a photo, hold for up to 9 seconds of video. */}
      <View style={{ alignItems: 'center', gap: t.space[2], paddingVertical: t.space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={event ? `Out at ${event.title}: open the camera` : 'Out: open the camera'}
          onPress={() => router.push('/outs/new')}
          style={({ pressed }) => ({
            width: 132,
            height: 132,
            borderRadius: 66,
            backgroundColor: t.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 6,
            borderColor: t.colors.surfaceAlt,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <AppText style={{ ...fontStyle(t.fonts.displayBold), color: t.colors.onPrimary, fontSize: 38, lineHeight: 44, letterSpacing: -1 }}>OUT</AppText>
        </Pressable>
        {event ? (
          <AppText variant="small" tone="muted">
            At {event.title}
          </AppText>
        ) : null}
      </View>

      {!inbox ? (
        <LoadingList rows={4} />
      ) : (
        <>
          {/* Your Out and your Insiders' Outs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[4] }}>
            <StoryBubble
              name="Your Out"
              avatarName={profile?.display_name ?? 'You'}
              avatarUrl={profile?.avatar_url}
              userId={profile?.id}
              ring={inbox.my_story.length > 0}
              label={inbox.my_story.length ? `Your Out, ${inbox.my_story.length} posted, seen by ${Math.max(0, ...inbox.my_story.map((s) => s.views))}` : 'Add to your Out'}
              onPress={() => (inbox.my_story.length ? view(inbox.my_story.map((s) => s.id)) : router.push('/outs/new'))}
              plus={!inbox.my_story.length}
            />
            {inbox.stories.map((s) => (
              <StoryBubble
                key={s.sender_id}
                name={s.name}
                avatarUrl={s.avatar_url}
                userId={s.sender_id}
                ring={!s.all_seen}
                label={`${s.name}'s Out${s.all_seen ? '' : ', new'}`}
                onPress={() => view(s.out_ids)}
              />
            ))}
          </ScrollView>

          <Section title="Received">
            {inbox.received.length === 0 ? (
              <EmptyState glyph="camera" title="No Outs right now" body="When your Insiders send you an Out, it shows up here until its time is up (6, 12 or 24 hours)." />
            ) : (
              inbox.received.map((r) => (
                <Card
                  key={r.sender_id}
                  onPress={() => view(r.out_ids)}
                  accessibilityLabel={
                    r.unopened ? `${r.name}: ${r.unopened} new Out${r.unopened === 1 ? '' : 's'}. Tap to open` : `${r.name}: ${r.out_ids.length} Out${r.out_ids.length === 1 ? '' : 's'}. Tap to look again`
                  }>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                    <Avatar name={r.name} uri={r.avatar_url} size={44} userId={r.sender_id} />
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold">{r.name}</AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            backgroundColor: r.unopened ? t.colors.primary : 'transparent',
                            borderWidth: 2,
                            borderColor: t.colors.primary,
                          }}
                        />
                        <AppText variant="small" tone={r.unopened ? 'primary' : 'muted'} weight={r.unopened ? 'bold' : undefined}>
                          {r.unopened ? `${r.unopened} new · tap to open` : 'Opened · tap to look again'} · {timeAgo(r.latest_at)}
                        </AppText>
                      </View>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </Section>

          {inbox.sent.length ? (
            <Section title="Sent">
              {inbox.sent.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], paddingVertical: t.space[1] }}>
                  <Ionicons name={s.opened === s.recipients ? 'mail-open-outline' : 'paper-plane-outline'} size={20} color={t.colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="small" weight="bold" numberOfLines={1}>
                      To {s.to}
                    </AppText>
                    <AppText variant="caption" tone="subtle">
                      {s.opened === s.recipients ? 'Opened' : `Opened by ${s.opened} of ${s.recipients}`}
                      {s.pins ? ` · pinned by ${s.pins}` : ''}
                      {s.screenshots ? ` · ${s.screenshots} screenshot${s.screenshots === 1 ? '' : 's'}` : ''} · {timeAgo(s.created_at)}
                    </AppText>
                  </View>
                  <IconButton
                    icon="trash-outline"
                    label={`Delete your Out to ${s.to}`}
                    onPress={() =>
                      confirmThen('Delete this Out?', 'Nobody can open it again, and it’s removed everywhere.', async () => {
                        try {
                          await deleteOut(s.id);
                          setInbox((i) => (i ? { ...i, sent: i.sent.filter((x) => x.id !== s.id) } : i));
                          refreshNewOuts();
                        } catch (e) {
                          toast(friendlyError(e));
                        }
                      }, 'Delete')
                    }
                  />
                </View>
              ))}
            </Section>
          ) : null}

          {inbox.pinned.length ? (
            <Section title="Pinned">
              <AppText variant="caption" tone="subtle">
                Outs you pinned stay here until you unpin them.
              </AppText>
              {inbox.pinned.map((p) => (
                <Card key={p.id} onPress={() => view([p.id])} accessibilityLabel={`Pinned Out from ${p.sender_name}${p.caption ? `: ${p.caption}` : ''}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                    <Avatar name={p.sender_name} uri={p.avatar_url} size={40} />
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" numberOfLines={1}>
                        {p.sender_name}
                      </AppText>
                      <AppText variant="small" tone="muted" numberOfLines={1}>
                        {[p.caption, p.event_title, timeAgo(p.created_at)].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    <Ionicons name="bookmark" size={18} color={t.colors.primary} />
                  </View>
                </Card>
              ))}
            </Section>
          ) : null}

          {inbox.my_story.length ? (
            <AppText variant="caption" tone="subtle">
              Your Out: {inbox.my_story.length} photo{inbox.my_story.length === 1 ? '' : 's'}, seen by {Math.max(0, ...inbox.my_story.map((s) => s.views))}
              {inbox.my_story.some((s) => s.pins) ? `, pinned by ${inbox.my_story.reduce((a, s) => a + s.pins, 0)}` : ''}
              {inbox.my_story.some((s) => s.screenshots) ? `, ${inbox.my_story.reduce((a, s) => a + s.screenshots, 0)} screenshot(s)` : ''}. Each one is gone when its time is up
              (6, 12 or 24 hours, you pick), unless someone pins it.
            </AppText>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function StoryBubble({
  name,
  avatarUrl,
  ring,
  label,
  onPress,
  plus,
  avatarName,
  userId,
}: {
  name: string;
  /** Whose photo or initials to show (defaults to the name). */
  avatarName?: string;
  avatarUrl?: string | null;
  userId?: string | null;
  ring: boolean;
  label: string;
  onPress: () => void;
  plus?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 72 }}>
      <View style={{ padding: 2, borderRadius: 34, borderWidth: 2, borderColor: ring ? t.colors.primary : t.colors.border }}>
        <Avatar name={avatarName ?? name} uri={avatarUrl ?? null} size={56} userId={userId} />
        {plus ? (
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={16} color={t.colors.onPrimary} />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" numberOfLines={1}>
        {plus !== undefined ? name : name.split(' ')[0]}
      </AppText>
    </Pressable>
  );
}
