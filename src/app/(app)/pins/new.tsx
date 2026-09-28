import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { MusicPicker } from '@/components/music/MusicPicker';
import { PhotoFilters, type Filtered } from '@/components/pins/PhotoFilters';
import { PhotoPicker } from '@/components/pins/PhotoPicker';
import { AppText, Button, Chip, type GlyphName, Screen, TextField, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import type { Song } from '@/features/music/api';
import { AUDIENCE_OPTIONS, createPin, type PinAudience, type PinCategory } from '@/features/pins/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const TYPES: { key: PinCategory; label: string; glyph: GlyphName; placeholder: string }[] = [
  { key: 'thought', label: 'Thought', glyph: 'thought', placeholder: "What's on your mind?" },
  { key: 'question', label: 'Question', glyph: 'question', placeholder: 'Ask your city something…' },
  { key: 'photos', label: 'Photos', glyph: 'camera', placeholder: 'Say something about these photos…' },
  { key: 'event', label: 'Event', glyph: 'calendar', placeholder: "What's happening, when, and where?" },
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
  const [music, setMusic] = useState<Song | null>(null);
  const [filtered, setFiltered] = useState<Filtered>({});
  const [audience, setAudience] = useState<PinAudience>('everyone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = TYPES.find((x) => x.key === category)!;

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
        photoUris: photos.map((p) => filtered[p]?.uri ?? p),
        music: photos.length ? music : null,
      });
      track('pin_posted', { category, photos: photos.length, audience, music: !!(photos.length && music), filters: Object.keys(filtered).length });
      toast(failedPhotos ? `Pin dropped, but ${failedPhotos} photo(s) didn't upload` : 'Pin dropped');
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
              <Chip key={x.key} label={x.label} glyph={x.glyph} selected={category === x.key} onPress={() => setCategory(x.key)} />
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

        <PhotoPicker photos={photos} onChange={setPhotos} display={Object.fromEntries(Object.entries(filtered).map(([k, v]) => [k, v.uri]))} />
        {photos.length ? <PhotoFilters photos={photos} value={filtered} onChange={setFiltered} /> : null}
        {photos.length ? <MusicPicker value={music} onChange={setMusic} /> : null}

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
                  aria-checked={selected}
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
