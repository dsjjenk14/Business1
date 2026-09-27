import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Chip, Screen, TextField, useToast } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { AUDIENCE_OPTIONS, MAX_PHOTOS, createPin, type PinAudience, type PinCategory } from '@/features/pins/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const TYPES: { key: PinCategory; label: string; placeholder: string }[] = [
  { key: 'thought', label: '💭 Thought', placeholder: "What's on your mind?" },
  { key: 'question', label: '❓ Question', placeholder: 'Ask your city something…' },
  { key: 'photos', label: '📷 Photos', placeholder: 'Say something about these photos…' },
  { key: 'event', label: '🎉 Event', placeholder: "What's happening, when, and where?" },
];

/** New Pin: text, type, up to 6 photos, and who can see it. */
export default function NewPin() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const { location, status } = useApproxLocation();

  const [category, setCategory] = useState<PinCategory>('thought');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [audience, setAudience] = useState<PinAudience>('everyone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = TYPES.find((x) => x.key === category)!;

  async function addPhotos() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  }

  async function submit() {
    if (!session) return;
    if (!body.trim()) {
      setError('Write something first.');
      return;
    }
    if (category === 'photos' && photos.length === 0) {
      setError('Add at least one photo for a Photos pin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { pinId, failedPhotos } = await createPin({
        userId: session.user.id,
        category,
        body,
        audience,
        lat: location?.lat,
        lng: location?.lng,
        photoUris: photos,
      });
      toast(failedPhotos ? `Pin dropped, but ${failedPhotos} photo(s) didn't upload` : 'Pin dropped 📍');
      router.replace({ pathname: '/pins/[id]', params: { id: String(pinId) } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="New Pin" />
      <Screen contentGap={t.space[5]}>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            Pin type
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {TYPES.map((x) => (
              <Chip key={x.key} label={x.label} selected={category === x.key} onPress={() => setCategory(x.key)} />
            ))}
          </View>
        </View>

        <TextField
          label="Your pin"
          value={body}
          onChangeText={(v) => {
            setBody(v);
            setError(null);
          }}
          placeholder={type.placeholder}
          multiline
          maxLength={2000}
          style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
          hint={`${body.length}/2000`}
        />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            Photos · optional · up to {MAX_PHOTOS}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {photos.map((uri, i) => (
              <View key={uri} style={{ width: 96, height: 96, borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => setPhotos((p) => p.filter((x) => x !== uri))}
                  hitSlop={8}
                  style={{ position: 'absolute', top: 4, right: 4 }}>
                  <Ionicons name="close-circle" size={24} color={t.colors.text} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                onPress={addPhotos}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: t.radius.md,
                  borderWidth: t.borderWidth.regular,
                  borderStyle: 'dashed',
                  borderColor: t.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}>
                <Ionicons name="images-outline" size={24} color={t.colors.textMuted} />
                <AppText variant="caption" tone="muted">
                  Add photo
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            Who sees this
          </AppText>
          <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
            {AUDIENCE_OPTIONS.map((o) => {
              const selected = audience === o.key;
              return (
                <Pressable
                  key={o.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setAudience(o.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[3],
                    padding: t.space[3],
                    borderRadius: t.radius.md,
                    borderWidth: t.borderWidth.regular,
                    borderColor: selected ? t.colors.primary : t.colors.border,
                    backgroundColor: t.colors.surface,
                  }}>
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? t.colors.primary : t.colors.textSubtle} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{o.label}</AppText>
                    <AppText variant="small" tone="muted">
                      {o.detail}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <AppText variant="caption" tone="subtle">
          📍{' '}
          {status === 'granted'
            ? 'Your location is shared approximately (about a quarter mile), never exactly.'
            : 'Location is off, so this pin uses your profile area. Distances stay approximate.'}
        </AppText>

        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Drop Pin" onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
