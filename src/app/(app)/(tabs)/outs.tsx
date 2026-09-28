import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { AppText, Avatar, Card, EmptyState, LoadingList, Section } from '@/components/ui';
import { fetchOutEvent, fetchOutsInbox, type OutEvent, type OutsInbox } from '@/features/outs/api';
import { refreshNewOuts } from '@/features/outs/useNewOuts';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * Outs: photos that disappear after 6 hours. Send one to friends in your
 * circle or post it to My Out (your circle, or your network if you choose).
 * Pinning an Out keeps it; the person who took it is told.
 */
export default function Outs() {
  const t = useTheme();
  const router = useRouter();
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={event ? `Take an Out at ${event.title}` : 'Take an Out'}
        onPress={() => router.push('/outs/new')}
        style={{ borderRadius: t.radius.lg, backgroundColor: t.colors.primary, padding: t.space[5], flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: t.colors.onPrimary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="camera" size={26} color={t.colors.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="h1" style={{ color: t.colors.onPrimary }}>
            Take an Out
          </AppText>
          <AppText style={{ color: t.colors.onPrimary, fontFamily: t.fonts.mono, fontSize: 10.5, lineHeight: 15, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {event ? `At ${event.title} · ` : ''}Gone in 6 hrs unless pinned
          </AppText>
        </View>
      </Pressable>

      {!inbox ? (
        <LoadingList rows={4} />
      ) : (
        <>
          {/* My Out and friends' My Outs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[4] }}>
            <StoryBubble
              name="My Out"
              ring={inbox.my_story.length > 0}
              label={inbox.my_story.length ? `My Out, ${inbox.my_story.length} posted, seen by ${Math.max(0, ...inbox.my_story.map((s) => s.views))}` : 'Add to My Out'}
              onPress={() => (inbox.my_story.length ? view(inbox.my_story.map((s) => s.id)) : router.push('/outs/new'))}
              plus={!inbox.my_story.length}
            />
            {inbox.stories.map((s) => (
              <StoryBubble
                key={s.sender_id}
                name={s.name}
                avatarUrl={s.avatar_url}
                ring={!s.all_seen}
                label={`${s.name}'s Out${s.all_seen ? '' : ', new'}`}
                onPress={() => view(s.out_ids)}
              />
            ))}
          </ScrollView>

          <Section title="Received">
            {inbox.received.length === 0 ? (
              <EmptyState glyph="camera" title="No Outs right now" body="When friends in your circle send you an Out, it shows up here for 6 hours." />
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
                    <Avatar name={r.name} uri={r.avatar_url} size={44} />
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
              My Out: {inbox.my_story.length} photo{inbox.my_story.length === 1 ? '' : 's'}, seen by {Math.max(0, ...inbox.my_story.map((s) => s.views))}
              {inbox.my_story.some((s) => s.pins) ? `, pinned by ${inbox.my_story.reduce((a, s) => a + s.pins, 0)}` : ''}
              {inbox.my_story.some((s) => s.screenshots) ? `, ${inbox.my_story.reduce((a, s) => a + s.screenshots, 0)} screenshot(s)` : ''}. Each one is gone 6 hours
              after you post it, unless someone pins it.
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
}: {
  name: string;
  avatarUrl?: string | null;
  ring: boolean;
  label: string;
  onPress: () => void;
  plus?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 72 }}>
      <View style={{ padding: 2, borderRadius: 34, borderWidth: 2, borderColor: ring ? t.colors.primary : t.colors.border }}>
        <Avatar name={name} uri={avatarUrl ?? null} size={56} />
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
