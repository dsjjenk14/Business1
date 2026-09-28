import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Button, Card, GlyphTile, Section } from '@/components/ui';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

export type ChatPreview = { conversation_id: number; title: string; glyph: string | null; last_body: string | null; last_at: string | null; unread: boolean };

/** Your group chats (Groups and chats you started), newest first, with a way to start one. */
export function GroupChatsCard({ chats }: { chats: ChatPreview[] }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Section title="Your group chats" action={{ label: chats.length ? 'All messages' : 'New group chat', onPress: () => router.push(chats.length ? '/messages' : '/chat/new') }}>
      {chats.length ? (
        <Card>
          <View style={{ gap: t.space[1] }}>
            {chats.map((c) => (
              <Pressable
                key={c.conversation_id}
                accessibilityRole="link"
                accessibilityLabel={`${c.title}${c.unread ? ', unread' : ''}`}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(c.conversation_id) } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
                <GlyphTile name={c.glyph ?? 'chat'} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {c.title}
                  </AppText>
                  <AppText variant="small" tone={c.unread ? 'text' : 'muted'} weight={c.unread ? 'bold' : undefined} numberOfLines={1}>
                    {c.last_body ?? 'No messages yet'}
                  </AppText>
                </View>
                {c.last_at ? (
                  <AppText variant="caption" tone="subtle">
                    {timeAgo(c.last_at)}
                  </AppText>
                ) : null}
                {c.unread ? <View accessibilityLabel="Unread" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" tone="muted">
              Start a group chat with people you know, or join a Group to get its chat.
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="New group chat" size="md" style={{ flex: 1 }} onPress={() => router.push('/chat/new')} />
              <Button label="Find Groups" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/circles', params: { tab: 'groups' } })} />
            </View>
          </View>
        </Card>
      )}
    </Section>
  );
}
