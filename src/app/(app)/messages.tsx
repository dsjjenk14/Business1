import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Card, GlyphTile, LoadingList, Screen, Section } from '@/components/ui';
import { fetchMyDates, type MyDate } from '@/features/dates/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

type Row = {
  conversation_id: number;
  kind: 'direct' | 'group' | 'chat';
  title: string;
  glyph: string | null;
  other_id: string | null;
  avatar_url: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  unread: boolean;
};

/** Messages: date requests waiting on you, direct chats, and group chats. */
export default function Messages() {
  const t = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dates, setDates] = useState<MyDate[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([supabase.rpc('inbox'), fetchMyDates().catch(() => [])]).then(([inbox, d]) => {
        if (cancelled) return;
        setRows(((inbox.data ?? []) as Row[]).filter(Boolean));
        setDates(d);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const open = (r: Row) => router.push({ pathname: '/chat/[id]', params: { id: String(r.conversation_id) } });

  const renderRow = (r: Row) => (
    <Pressable
      key={r.conversation_id}
      accessibilityRole="link"
      accessibilityLabel={`${r.title}${r.unread ? ', unread' : ''}${r.last_body ? `: ${r.last_body}` : ''}`}
      onPress={() => open(r)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
      {r.kind !== 'direct' ? <GlyphTile name={r.glyph} size={44} /> : <Avatar name={r.title} uri={r.avatar_url} size={44} />}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
          <AppText weight="bold" numberOfLines={1} style={{ flex: 1 }}>
            {r.title}
          </AppText>
          {r.last_at ? (
            <AppText variant="caption" tone="subtle">
              {timeAgo(r.last_at)}
            </AppText>
          ) : null}
        </View>
        <AppText variant="small" tone={r.unread ? 'text' : 'muted'} weight={r.unread ? 'bold' : undefined} numberOfLines={1}>
          {r.last_body ? `${r.last_sender_id === me ? 'You: ' : ''}${r.last_body}` : 'No messages yet'}
        </AppText>
      </View>
      {r.unread ? <View accessibilityLabel="Unread" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /> : null}
    </Pressable>
  );

  const waiting = dates.filter((d) => d.status === 'pending' && !d.i_sent);
  const direct = (rows ?? []).filter((r) => r.kind === 'direct');
  const groups = (rows ?? []).filter((r) => r.kind !== 'direct');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Messages" />
      <Screen contentGap={t.space[5]}>
        {waiting.length ? (
          <Section title="Date requests">
            {waiting.map((d) => (
              <Card key={d.id} accent="primary" onPress={() => router.push({ pathname: '/dates/[id]', params: { id: String(d.id) } })} accessibilityLabel={`Date request from ${d.other_name}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <Avatar name={d.other_name} uri={d.other_avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{d.other_name} asked you on a date</AppText>
                    <AppText variant="small" tone="muted">
                      {d.label}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))}
          </Section>
        ) : null}

        {rows === null ? (
          <LoadingList />
        ) : (
          <>
            <Section title="Chats">
              {direct.length ? (
                direct.map(renderRow)
              ) : (
                <AppText variant="small" tone="muted">
                  No chats yet. Open someone&apos;s profile and tap Message. You can message people you met through an intro right away, and
                  anyone else in your circle after 5 back-and-forths on Pins.
                </AppText>
              )}
            </Section>
            <Section title="Group chats" action={{ label: 'New group chat', onPress: () => router.push('/chat/new') }}>
              {groups.length ? (
                groups.map(renderRow)
              ) : (
                <AppText variant="small" tone="muted">
                  Start a group chat with people in your circle, or join a Group (Circles → Groups) to get its chat.
                </AppText>
              )}
            </Section>
          </>
        )}
      </Screen>
    </View>
  );
}
