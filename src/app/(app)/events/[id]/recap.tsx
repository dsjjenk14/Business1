import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { PhotoPicker } from '@/components/pins/PhotoPicker';
import { AppText, Avatar, Button, Card, Chip, Screen, TextField, useToast } from '@/components/ui';
import { fetchEvent, postRecap, type EventDetail } from '@/features/events/api';
import { uploadPinPhotos } from '@/features/pins/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** After an event: a recap pin with photos, tagging who was there. */
export default function EventRecap() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchEvent(Number(id))
      .then(setEvent)
      .catch(() => setEvent(null));
  }, [id]);

  const others = (event?.going ?? []).filter((p) => p.id !== me);

  async function submit() {
    if (!me || !event) return;
    setBusy(true);
    try {
      const pinId = await postRecap(event.id, body, tags);
      const failed = photos.length ? await uploadPinPhotos(me, pinId, photos) : 0;
      toast(failed ? `Recap posted, but ${failed} photo(s) didn't upload` : 'Recap posted 🎉');
      router.replace({ pathname: '/pins/[id]', params: { id: String(pinId) } });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Event Recap" />
      <Screen contentGap={t.space[5]}>
        {event ? (
          <Card accent="primary">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <AppText style={{ fontSize: 30 }}>🎉</AppText>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">Drop a recap pin</AppText>
                <AppText variant="small" tone="muted">
                  {[event.title, event.venue?.name, dayTime(event.starts_at)].filter(Boolean).join(' · ')}
                </AppText>
              </View>
            </View>
          </Card>
        ) : null}

        <TextField label="How was it?" value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Best night out in a while…" />

        <PhotoPicker photos={photos} onChange={setPhotos} />

        {others.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="label" tone="subtle">
              Tag who was there
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {others.map((p) => {
                const selected = tags.includes(p.id);
                return (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Avatar name={p.display_name} emoji={p.avatar_emoji} uri={p.avatar_url} size={28} />
                    <Chip
                      label={p.display_name}
                      selected={selected}
                      accessibilityLabel={`${selected ? 'Untag' : 'Tag'} ${p.display_name}`}
                      onPress={() => setTags((s) => (selected ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <Button label="Post Recap Pin" onPress={submit} loading={busy} disabled={!body.trim() || !event} />
        <Button label="Skip" variant="ghost" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
