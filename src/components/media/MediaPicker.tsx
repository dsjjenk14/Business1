import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppText, Button, useToast } from '@/components/ui';
import { MAX_VIDEO_SECONDS, onBoomerangDraft, takeBoomerangDraft } from '@/features/media/api';
import { useTheme } from '@/theme';

import { BoomerangPlayer } from './BoomerangPlayer';
import { VideoPlayer } from './VideoPlayer';

export type MediaDraft = { kind: 'video'; uri: string; durationS: number | null } | { kind: 'boomerang'; frames: string[] } | null;

/** Add a video (up to 30 seconds) or a boomerang to a post, instead of photos. */
export function MediaPicker({ value, onChange }: { value: MediaDraft; onChange: (m: MediaDraft) => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();

  // Pick up a boomerang captured on the camera screen.
  useEffect(() => {
    const waiting = takeBoomerangDraft();
    if (waiting) onChange({ kind: 'boomerang', frames: waiting });
    return onBoomerangDraft((frames) => {
      if (frames) onChange({ kind: 'boomerang', frames: takeBoomerangDraft() ?? frames });
    });
  }, [onChange]);

  async function pickVideo(fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['videos'],
      videoMaxDuration: MAX_VIDEO_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    };
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return toast('Allow the camera to record a video.');
      }
      const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const a = result.canceled ? null : result.assets[0];
      if (!a) return;
      const seconds = a.duration != null ? a.duration / 1000 : null;
      if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) return toast(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`);
      if (a.fileSize && a.fileSize > 50 * 1024 * 1024) return toast('That video is too big (50 MB max). Try a shorter one.');
      onChange({ kind: 'video', uri: a.uri, durationS: seconds });
    } catch {
      toast('Couldn’t open that video.');
    }
  }

  if (value) {
    return (
      <View style={{ gap: t.space[2] }}>
        <AppText variant="label" tone="subtle">
          {value.kind === 'video' ? 'Video' : 'Boomerang'}
        </AppText>
        {value.kind === 'video' ? <VideoPlayer uri={value.uri} /> : <BoomerangPlayer frames={value.frames} />}
        <Button label={value.kind === 'video' ? 'Remove video' : 'Remove boomerang'} variant="ghost" size="md" onPress={() => onChange(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Or a video / boomerang
      </AppText>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Tile t={t} icon="film-outline" label="Choose video" onPress={() => pickVideo(false)} />
        {Platform.OS !== 'web' ? <Tile t={t} icon="videocam-outline" label="Record video" onPress={() => pickVideo(true)} /> : null}
        <Tile t={t} icon="infinite-outline" label="Boomerang" onPress={() => router.push('/boomerang')} />
      </View>
    </View>
  );
}

function Tile({ t, icon, label, onPress }: { t: ReturnType<typeof useTheme>; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 64,
        borderRadius: t.radius.md,
        borderWidth: t.borderWidth.regular,
        borderStyle: 'dashed',
        borderColor: t.colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
      <Ionicons name={icon} size={22} color={t.colors.textMuted} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </Pressable>
  );
}
