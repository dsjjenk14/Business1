import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { DrinkMenu } from '@/components/drinks/DrinkMenu';
import { LiveVideo } from '@/components/live/LiveVideo';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Button, EmptyState, LoadingDetail, Screen, TextField, useToast } from '@/components/ui';
import { endLive, fetchLiveDetail, postLiveComment, type LiveComment, type LiveDetail } from '@/features/live/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Watching (or hosting) a live video: the video, live comments, and End / Report. */
export default function LiveScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const streamId = Number(id);
  const [live, setLive] = useState<LiveDetail | null | undefined>(undefined);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drinkMenu, setDrinkMenu] = useState(false);
  const lastId = useRef(0);

  const poll = useCallback(async () => {
    try {
      const d = await fetchLiveDetail(streamId, lastId.current);
      setLive(d);
      if (d?.comments.length) {
        lastId.current = d.comments[d.comments.length - 1]!.id;
        setComments((c) => [...c, ...d.comments].slice(-100));
      }
    } catch {
      setLive((l) => (l === undefined ? null : l));
    }
  }, [streamId]);

  // New comments every few seconds while it's live.
  useEffect(() => {
    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [poll]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await postLiveComment(streamId, text);
      setText('');
      poll();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    try {
      await endLive(streamId);
      toast('Your live video ended');
      router.back();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Live" />
      <Screen contentGap={t.space[4]}>
        {live === undefined ? (
          <LoadingDetail />
        ) : !live ? (
          <EmptyState glyph="camera" title="Live video not found" body="It may have ended, or it isn't shared with you." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
              {live.is_live ? <Badge label="LIVE" tone="primary" /> : <Badge label="Ended" tone="neutral" />}
              <AppText weight="bold" style={{ flex: 1 }} numberOfLines={2}>
                {live.host_name}: {live.title}
              </AppText>
            </View>

            {live.is_live ? <LiveVideo streamId={live.id} isHost={live.is_host} /> : null}

            {live.is_host && live.is_live ? <Button label="End live video" variant="danger" size="md" onPress={end} /> : null}
            {!live.is_host && live.is_live ? (
              <>
                <Button
                  label={`Send ${live.host_name.split(' ')[0]} a drink`}
                  icon={<Ionicons name="wine" size={18} color={t.colors.onPrimary} />}
                  onPress={() => setDrinkMenu(true)}
                />
                <DrinkMenu visible={drinkMenu} onClose={() => setDrinkMenu(false)} hostName={live.host_name} to={{ liveId: live.id }} />
              </>
            ) : null}

            <View style={{ gap: t.space[2] }} accessibilityLiveRegion="polite">
              {comments.length === 0 ? (
                <AppText variant="small" tone="subtle">
                  No comments yet.
                </AppText>
              ) : (
                comments.map((c) => (
                  <AppText key={c.id} variant="small">
                    <AppText variant="small" weight="bold">
                      {c.name}{' '}
                    </AppText>
                    {c.body}
                  </AppText>
                ))
              )}
            </View>

            {live.is_live ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space[2] }}>
                <View style={{ flex: 1 }}>
                  <TextField label="Comment" value={text} onChangeText={setText} placeholder="Say something" maxLength={200} onSubmitEditing={send} returnKeyType="send" />
                </View>
                <Button label="Send" size="md" onPress={send} loading={busy} disabled={!text.trim()} />
              </View>
            ) : null}

            {!live.is_host ? (
              <Button
                label="Report this live video"
                variant="ghost"
                size="md"
                onPress={() => router.push({ pathname: '/report', params: { user: live.host_id, name: live.host_name } })}
              />
            ) : null}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
