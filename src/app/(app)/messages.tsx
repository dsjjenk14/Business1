import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Card, Screen, Section } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

type Row = { id: number; title: string; emoji: string | null; avatarUrl: string | null; last: string; at: string | null; unread: boolean; group: boolean };

/** Inbox: group chats and direct messages. Starting DMs and "Ask on a Date" come in Phase 5. */
export default function Messages() {
  const t = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('last_read_at, conversations(id, kind, direct_a, direct_b, last_message_at, groups(name, emoji))')
        .eq('user_id', me);
      const convs = (memberships ?? []).flatMap((m) => (m.conversations ? [{ ...m.conversations, last_read_at: m.last_read_at }] : []));
      const otherIds = convs.filter((c) => c.kind === 'direct').map((c) => (c.direct_a === me ? c.direct_b : c.direct_a)).filter(Boolean) as string[];
      const [{ data: people }, { data: lastMessages }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_emoji, avatar_url').in('id', otherIds),
        supabase.from('messages').select('conversation_id, body, created_at').in('conversation_id', convs.map((c) => c.id)).order('created_at', { ascending: false }),
      ]);
      const result: Row[] = convs
        .filter((c) => c.last_message_at)
        .map((c) => {
          const last = lastMessages?.find((m) => m.conversation_id === c.id);
          const other = people?.find((p) => p.id === (c.direct_a === me ? c.direct_b : c.direct_a));
          return {
            id: c.id,
            group: c.kind === 'group',
            title: c.kind === 'group' ? c.groups?.name ?? 'Group' : other?.display_name ?? 'Member',
            emoji: c.kind === 'group' ? c.groups?.emoji ?? null : other?.avatar_emoji ?? null,
            avatarUrl: c.kind === 'group' ? null : other?.avatar_url ?? null,
            last: last?.body ?? '',
            at: c.last_message_at,
            unread: !!c.last_message_at && (!c.last_read_at || c.last_message_at > c.last_read_at),
          };
        })
        .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
      setRows(result);
    })();
  }, [me]);

  const renderRow = (r: Row) => (
    <Card key={r.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(r.id) } })} accessibilityLabel={`${r.title}${r.unread ? ', unread' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Avatar name={r.title} uri={r.avatarUrl} size={44} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText weight="bold">{r.title}</AppText>
            <AppText variant="caption" tone="subtle">
              {r.at ? timeAgo(r.at) : ''}
            </AppText>
          </View>
          <AppText variant="small" tone={r.unread ? 'text' : 'muted'} numberOfLines={1}>
            {r.last}
          </AppText>
        </View>
      </View>
    </Card>
  );

  return (
    <>
      <BackHeader title="Messages" />
      <Screen>
        {rows && rows.length === 0 ? (
          <AppText tone="muted" align="center">
            No messages yet. You can message people in your circle once you&apos;ve interacted a few times.
          </AppText>
        ) : null}
        {rows && rows.some((r) => !r.group) ? (
          <Section title="Direct" bare>
            <View style={{ gap: t.space[2] }}>{rows.filter((r) => !r.group).map(renderRow)}</View>
          </Section>
        ) : null}
        {rows && rows.some((r) => r.group) ? (
          <Section title="Group chats" bare>
            <View style={{ gap: t.space[2] }}>{rows.filter((r) => r.group).map(renderRow)}</View>
          </Section>
        ) : null}
        <AppText variant="caption" tone="subtle" align="center">
          Opening chats and replying arrives in Phase 5.
        </AppText>
      </Screen>
    </>
  );
}
