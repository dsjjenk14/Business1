import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/nav/AppHeader';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Avatar, Button, Card, IconButton, LoadingDetail, TextField, useToast } from '@/components/ui';
import { addReply, deletePin, editPin, fetchFeed, fetchReplies, type FeedPin, type Reply } from '@/features/pins/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { MAX_FONT_SCALE, useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

/** One pin with its reply thread. The author can edit or delete it. */
export default function PinThread() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pinId = Number(id);
  const { session } = useAuth();
  const me = session?.user.id;

  const [pin, setPin] = useState<FeedPin | null | undefined>(undefined);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const fetchAll = useCallback(async () => {
    const [feed, thread] = await Promise.all([fetchFeed({ mode: 'single', pin: pinId, limit: 1 }), fetchReplies(pinId)]);
    return { pin: feed[0] ?? null, replies: thread };
  }, [pinId]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((r) => {
        if (cancelled) return;
        setPin(r.pin);
        setReplies(r.replies);
      })
      .catch(() => !cancelled && setPin(null));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  async function send() {
    if (!me || !draft.trim() || sending) return;
    setSending(true);
    try {
      await addReply(pinId, me, draft);
      setDraft('');
      const r = await fetchAll();
      setPin(r.pin);
      setReplies(r.replies);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    if (!editText.trim()) return;
    try {
      await editPin(pinId, editText);
      setEditing(false);
      const r = await fetchAll();
      setPin(r.pin);
      toast('Pin updated');
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function remove() {
    try {
      await deletePin(pinId);
      toast('Pin deleted');
      goBackOr(router, '/pins');
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  if (pin === null) {
    return (
      <>
        <BackHeader title="Pin" />
        <View style={{ flex: 1, backgroundColor: t.colors.bg, padding: t.space[5] }}>
          <AppText tone="muted" align="center">
            This pin isn&apos;t available. It may have been deleted, or it&apos;s only shared with someone&apos;s circle.
          </AppText>
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader
        title="Pin thread"
        right={pin?.is_mine ? <IconButton icon="create-outline" label="Edit pin" onPress={() => { setEditText(pin.body); setEditing(true); }} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: t.space[4], gap: t.space[3], width: '100%', maxWidth: 640, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {pin ? (
          editing ? (
            <Card>
              <TextField label="Edit your pin" value={editText} onChangeText={setEditText} multiline maxLength={2000} style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} />
              <View style={{ flexDirection: 'row', gap: t.space[2], marginTop: t.space[3] }}>
                <Button label="Save" size="md" onPress={saveEdit} style={{ flex: 1 }} />
                <Button label="Cancel" size="md" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              </View>
              <Button label="Delete pin" size="md" variant="ghost" onPress={remove} icon={<Ionicons name="trash-outline" size={18} color={t.colors.danger} />} />
            </Card>
          ) : (
            <PinCard pin={pin} linkToThread={false} locationMode="none" onChange={setPin} />
          )
        ) : (
          <LoadingDetail />
        )}

        <AppText variant="label" tone="subtle" style={{ marginTop: t.space[2] }}>
          {replies.length === 0 ? 'No replies yet' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
        </AppText>
        {replies.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${r.author?.display_name ?? 'Member'}'s profile`}
              onPress={() => (r.author_id === me ? router.push('/profile') : router.push({ pathname: '/people/[id]', params: { id: r.author_id } }))}>
              <Avatar name={r.author?.display_name ?? 'Member'} uri={r.author?.avatar_url} size={34} />
            </Pressable>
            <View style={{ flex: 1, backgroundColor: t.colors.surface, borderRadius: t.radius.md, padding: t.space[3], gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="small" weight="bold">
                  {r.author_id === me ? 'You' : r.author?.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {timeAgo(r.created_at)}
                </AppText>
              </View>
              <AppText variant="small">{r.body}</AppText>
              {r.author_id !== me ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Report reply from ${r.author?.display_name ?? 'member'}`}
                  onPress={() => router.push({ pathname: '/report', params: { reply: String(r.id), name: r.author?.display_name ?? '' } })}
                  hitSlop={8}
                  style={{ alignSelf: 'flex-end' }}>
                  <AppText variant="caption" tone="subtle">
                    Report
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          paddingTop: t.space[2],
          paddingBottom: insets.bottom + t.space[2],
          borderTopWidth: t.borderWidth.hairline,
          borderColor: t.colors.border,
          backgroundColor: t.colors.bg,
        }}>
        <TextInput
          accessibilityLabel="Write a reply"
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply to this pin…"
          placeholderTextColor={t.colors.textSubtle}
          multiline
          maxLength={1000}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[
            {
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              paddingHorizontal: t.space[3],
              paddingVertical: 10,
              borderRadius: t.radius.lg,
              backgroundColor: t.colors.surfaceAlt,
              color: t.colors.text,
              fontFamily: t.fonts.body,
              fontSize: 15,
            },
            { outlineStyle: 'none' } as object,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          disabled={!draft.trim() || sending}
          onPress={send}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: draft.trim() ? t.colors.primary : t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="send" size={18} color={draft.trim() ? t.colors.onPrimary : t.colors.textSubtle} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
