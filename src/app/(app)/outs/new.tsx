import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';

import { CameraCapture } from '@/components/camera/CameraCapture';
import { PeoplePicker } from '@/components/chat/PeoplePicker';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Chip, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { fetchChatCandidates, type ChatCandidate } from '@/features/chat/api';
import { fetchOutEvent, sendOut, type OutAudience, type OutEvent } from '@/features/outs/api';
import { refreshNewOuts } from '@/features/outs/useNewOuts';
import { playSound } from '@/features/sounds/sounds';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Take an Out anywhere: snap, add a caption, send to friends and/or My Out. Gone in an hour unless pinned. */
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
  // Each My Out picks who sees it: 1st degree only (the default) or 1st + 2nd.
  const [audience, setAudience] = useState<OutAudience>('circle');
  const [busy, setBusy] = useState(false);
  // At an I'm In event, its name goes on the Out.
  const [event, setEvent] = useState<OutEvent | null>(null);

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
      await sendOut({ userId: session.user.id, uri: photo, caption, to: [...to], toStory, audience });
      track('out_sent', { to: to.size, story: toStory, audience: toStory ? audience : null });
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
              {audience === 'circle' ? 'Your circle' : 'Your network'} can watch it for an hour.
            </AppText>
          </View>
          <Switch value={toStory} onValueChange={setToStory} accessibilityLabel="My Out: people you choose can watch it for an hour" />
        </Pressable>
        {toStory ? (
          <View style={{ gap: t.space[2] }}>
            <AppText weight="bold">Who sees this My Out?</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              <Chip label="My Circle (1st only)" selected={audience === 'circle'} onPress={() => setAudience('circle')} />
              <Chip label="My Network (1st + 2nd)" selected={audience === 'network'} onPress={() => setAudience('network')} />
            </View>
            <AppText variant="caption" tone="muted">
              {audience === 'circle'
                ? 'Only people you’re directly connected to. Nobody else.'
                : 'Your circle, plus the people they know.'}
            </AppText>
          </View>
        ) : null}
        <AppText variant="label" tone="subtle">
          Friends in your circle (they can look for an hour)
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
