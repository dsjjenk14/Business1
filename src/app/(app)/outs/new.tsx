import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';

import { CameraCapture } from '@/components/camera/CameraCapture';
import { PeoplePicker } from '@/components/chat/PeoplePicker';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, EmptyState, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { fetchChatCandidates, type ChatCandidate } from '@/features/chat/api';
import { fetchOutEvent, sendOut, type OutEvent } from '@/features/outs/api';
import { refreshNewOuts } from '@/features/outs/useNewOuts';
import { playSound } from '@/features/sounds/sounds';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Take an Out: snap, add a caption, send to friends and/or My Out. */
export default function NewOut() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [step, setStep] = useState<'snap' | 'send'>('snap');
  const [people, setPeople] = useState<ChatCandidate[]>([]);
  const [to, setTo] = useState<Set<string>>(new Set());
  const [toStory, setToStory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState<OutEvent | null | undefined>(undefined);

  useEffect(() => {
    fetchOutEvent()
      .then(setEvent)
      .catch(() => setEvent(null));
    fetchChatCandidates()
      .then(setPeople)
      .catch(() => undefined);
  }, []);
  const circle = useMemo(() => people.filter((p) => p.in_circle), [people]);

  async function send() {
    if (!session || !photo) return;
    setBusy(true);
    try {
      await sendOut({ userId: session.user.id, uri: photo, caption, to: [...to], toStory });
      track('out_sent', { to: to.size, story: toStory });
      playSound('sent');
      toast(to.size ? `Out sent to ${to.size} ${to.size === 1 ? 'friend' : 'friends'}` : 'Posted to My Out');
      refreshNewOuts();
      router.back();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (event === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Take an Out" />
        <View style={{ flex: 1, justifyContent: 'center', padding: t.space[5] }}>
          <EmptyState
            glyph="camera"
            title="Outs open at events"
            body="You can post Outs when you're at an event on I'm In. Say I'm In to one, and when you get there the app marks you there."
            action={{ label: 'Find something happening', onPress: () => router.replace('/whats-in') }}
          />
        </View>
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <BackHeader title={event ? `Out at ${event.title}` : 'Take an Out'} />
        <CameraCapture mode="photo" onCaptured={(uris) => setPhoto(uris[0] ?? null)} />
      </View>
    );
  }

  if (step === 'snap') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BackHeader title="Your Out" />
        <View style={{ flex: 1 }}>
          <Image source={{ uri: photo }} style={{ flex: 1 }} contentFit="cover" accessibilityLabel="Your photo" />
          <View style={{ position: 'absolute', left: 0, right: 0, top: '60%', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: t.space[4], paddingVertical: t.space[2] }}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption"
              placeholderTextColor="rgba(255,255,255,0.7)"
              maxLength={120}
              accessibilityLabel="Caption"
              style={{ color: '#FFFFFF', fontSize: 18, textAlign: 'center', fontFamily: t.fonts.bodyMedium, minHeight: 32 }}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: t.space[2], padding: t.space[4] }}>
          <Button label="Retake" variant="secondary" style={{ flex: 1 }} onPress={() => setPhoto(null)} />
          <Button label="Send to" style={{ flex: 1 }} onPress={() => setStep('send')} icon={<Ionicons name="arrow-forward" size={18} color={t.colors.onPrimary} />} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Send to" />
      <ScrollView contentContainerStyle={{ padding: t.space[4], gap: t.space[4], paddingBottom: 120 }}>
        <Pressable
          accessible={false}
          onPress={() => setToStory((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.surface }}>
          <Ionicons name="albums-outline" size={24} color={t.colors.primaryText} />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">My Out</AppText>
            <AppText variant="small" tone="muted">
              Your circle can watch it for 24 hours.
            </AppText>
          </View>
          <Switch value={toStory} onValueChange={setToStory} accessibilityLabel="My Out: your circle can watch it for 24 hours" />
        </Pressable>
        <AppText variant="label" tone="subtle">
          Friends (they can open it once)
        </AppText>
        {circle.length ? (
          <PeoplePicker
            people={circle}
            selected={to}
            onToggle={(id) =>
              setTo((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
          />
        ) : (
          <AppText variant="small" tone="muted">
            No one in your circle yet. Add friends from the Circles tab, or post to My Out.
          </AppText>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: t.space[4], backgroundColor: t.colors.bg, borderTopWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
        <Button
          label={to.size || toStory ? `Send${to.size ? ` to ${to.size}` : ''}${toStory ? (to.size ? ' + My Out' : ' to My Out') : ''}` : 'Pick who gets it'}
          onPress={send}
          loading={busy}
          disabled={!to.size && !toStory}
        />
      </View>
    </View>
  );
}
