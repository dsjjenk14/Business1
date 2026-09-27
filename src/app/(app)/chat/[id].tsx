import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, useToast } from '@/components/ui';
import { fetchConversation, fetchMessages, markRead, sendMessage, subscribeToMessages, type ChatMessage, type ConversationInfo } from '@/features/chat/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { clockTime, marketDayKey } from '@/lib/time';
import { useTheme } from '@/theme';

/** A conversation (group chats for now; direct messages arrive in Phase 5). New messages appear live. */
export default function Chat() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);

  const [info, setInfo] = useState<ConversationInfo | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [olderDone, setOlderDone] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const latestRef = useRef<string | null>(null);

  const addMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
      latestRef.current = merged[merged.length - 1]?.created_at ?? null;
      return merged;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchConversation(conversationId);
        if (cancelled) return;
        setInfo(c);
        if (!c) return;
        const initial = await fetchMessages(conversationId);
        if (cancelled) return;
        addMessages(initial);
        setOlderDone(initial.length < 50);
        if (me) markRead(conversationId, me);
      } catch {
        if (!cancelled) setInfo(null);
      }
    })();
    const unsubscribe = subscribeToMessages(
      conversationId,
      (m) => {
        addMessages([m]);
        if (me && m.sender_id !== me) markRead(conversationId, me);
      },
      // (Re)connected: catch up on anything sent while the connection was down.
      () => {
        fetchMessages(conversationId, undefined, latestRef.current ?? undefined)
          .then((m) => !cancelled && addMessages(m))
          .catch(() => undefined);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId, me, addMessages]);

  async function loadOlder() {
    if (olderDone || !messages.length) return;
    const older = await fetchMessages(conversationId, messages[0]?.created_at);
    setOlderDone(older.length < 50);
    addMessages(older);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !me || sending) return;
    setSending(true);
    try {
      const m = await sendMessage(conversationId, me, body);
      setDraft('');
      addMessages([m]);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  const members = new Map((info?.members ?? []).map((m) => [m.id, m]));
  // Newest at the bottom: the list is inverted, so feed it newest-first.
  const data = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title={info ? info.title : 'Chat'} />
      {info === null ? (
        <AppText tone="muted" align="center" style={{ padding: t.space[6] }}>
          This chat isn&apos;t available.
        </AppText>
      ) : (
        <>
          <FlatList
            ref={listRef}
            inverted
            data={data}
            keyExtractor={(m) => String(m.id)}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ padding: t.space[4], gap: t.space[2] }}
            ListFooterComponent={
              info?.group_id ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(info.group_id) } })}
                  style={{ alignItems: 'center', paddingVertical: t.space[4] }}>
                  <AppText variant="caption" tone="subtle">
                    {info.members.length} members · See group →
                  </AppText>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              info ? (
                <AppText tone="subtle" align="center" style={{ padding: t.space[6], transform: [{ scaleY: -1 }] }}>
                  No messages yet. Say hi.
                </AppText>
              ) : null
            }
            renderItem={({ item, index }) => {
              const mine = item.sender_id === me;
              const sender = members.get(item.sender_id);
              const older = data[index + 1];
              const newDay = !older || marketDayKey(new Date(older.created_at)) !== marketDayKey(new Date(item.created_at));
              const showName = !mine && (newDay || older?.sender_id !== item.sender_id);
              return (
                <View style={{ gap: t.space[1] }}>
                  {newDay ? (
                    <AppText variant="caption" tone="subtle" align="center" style={{ marginVertical: t.space[2] }}>
                      {new Date(item.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: t.space[2] }}>
                    {!mine ? (
                      showName ? (
                        <Avatar name={sender?.display_name ?? 'Member'} uri={sender?.avatar_url ?? null} size={28} />
                      ) : (
                        <View style={{ width: 28 }} />
                      )
                    ) : null}
                    <Pressable
                      accessibilityHint={mine ? undefined : 'Long press to report this message'}
                      onLongPress={
                        mine
                          ? undefined
                          : () =>
                              router.push({
                                pathname: '/report',
                                params: { message: String(item.id), user: item.sender_id, name: sender?.display_name ?? 'this member' },
                              })
                      }
                      style={{
                        maxWidth: '78%',
                        paddingHorizontal: t.space[3],
                        paddingVertical: t.space[2],
                        borderRadius: t.radius.lg,
                        backgroundColor: mine ? t.colors.primary : t.colors.surface,
                        borderWidth: mine ? 0 : t.borderWidth.hairline,
                        borderColor: t.colors.border,
                      }}>
                      {showName ? (
                        <AppText variant="caption" weight="bold" tone="muted">
                          {sender?.display_name ?? 'Former member'}
                        </AppText>
                      ) : null}
                      <AppText style={mine ? { color: t.colors.onPrimary } : undefined}>{item.body}</AppText>
                      <AppText variant="caption" style={{ color: mine ? t.colors.onPrimary : t.colors.textSubtle, opacity: 0.8, alignSelf: 'flex-end' }}>
                        {clockTime(item.created_at)}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: t.space[2],
              paddingHorizontal: t.space[4],
              paddingTop: t.space[2],
              paddingBottom: Math.max(insets.bottom, t.space[3]),
              borderTopWidth: t.borderWidth.hairline,
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.bg,
            }}>
            <TextInput
              accessibilityLabel="Message"
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={t.colors.textSubtle}
              multiline
              maxLength={4000}
              onSubmitEditing={send}
              submitBehavior={Platform.OS === 'web' ? 'submit' : undefined}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                maxHeight: 120,
                paddingHorizontal: t.space[3],
                paddingVertical: t.space[2],
                borderRadius: t.radius.lg,
                backgroundColor: t.colors.surface,
                color: t.colors.text,
                fontFamily: t.fonts.body,
                fontSize: 16,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!draft.trim() || sending}
              onPress={send}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: draft.trim() ? t.colors.primary : t.colors.surfaceAlt,
              }}>
              <Ionicons name="send" size={18} color={draft.trim() ? t.colors.onPrimary : t.colors.textSubtle} />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
