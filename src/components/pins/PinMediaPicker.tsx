import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { BoomerangPlayer } from '@/components/media/BoomerangPlayer';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { AppText, Button, useToast } from '@/components/ui';
import { MAX_VIDEO_SECONDS, onBoomerangDraft, takeBoomerangDraft } from '@/features/media/api';
import { MAX_PHOTOS } from '@/features/pins/api';
import { useTheme } from '@/theme';

export type MediaDraft = { kind: 'video'; uri: string; durationS: number | null } | { kind: 'boomerang'; frames: string[] } | null;

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * One place for everything visual on a pin: take a photo or video with the
 * camera, upload photos or a video from your phone, or make a boomerang.
 * A pin has up to 6 photos, or one video, or one boomerang.
 */
export function PinMediaPicker({
  photos,
  onPhotos,
  media,
  onMedia,
  display,
}: {
  photos: string[];
  onPhotos: (next: string[]) => void;
  media: MediaDraft;
  onMedia: (m: MediaDraft) => void;
  /** What to show for each photo (e.g. with its filter). */
  display?: Record<string, string>;
}) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const room = MAX_PHOTOS - photos.length;
  const canCamera = Platform.OS !== 'web';

  // Pick up a boomerang captured on the camera screen.
  useEffect(() => {
    const waiting = takeBoomerangDraft();
    if (waiting) onMedia({ kind: 'boomerang', frames: waiting });
    return onBoomerangDraft((frames) => {
      if (frames) onMedia({ kind: 'boomerang', frames: takeBoomerangDraft() ?? frames });
    });
  }, [onMedia]);

  function take(assets: ImagePicker.ImagePickerAsset[]) {
    const videos = assets.filter((a) => a.type === 'video');
    const images = assets.filter((a) => a.type !== 'video');
    if (videos.length) {
      if (photos.length || images.length || videos.length > 1) toast('A pin can have up to 6 photos or one video, not both.');
      if (photos.length) return; // keep the photos already picked
      const v = videos[0]!;
      const seconds = v.duration != null ? v.duration / 1000 : null;
      if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) return toast(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`);
      if (v.fileSize && v.fileSize > MAX_VIDEO_BYTES) return toast('That video is too big (50 MB max). Try a shorter one.');
      onMedia({ kind: 'video', uri: v.uri, durationS: seconds });
      return;
    }
    if (images.length > room) toast(`Up to ${MAX_PHOTOS} photos per pin.`);
    onPhotos([...photos, ...images.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  }

  async function fromCamera() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return toast('Allow the camera to take a photo or video.');
      const result = await ImagePicker.launchCameraAsync({
        // Once there are photos, the camera adds another photo.
        mediaTypes: photos.length ? ['images'] : ['images', 'videos'],
        videoMaxDuration: MAX_VIDEO_SECONDS,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        quality: 0.8,
      });
      if (!result.canceled) take(result.assets);
    } catch {
      toast('Couldn’t open the camera.');
    }
  }

  async function fromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: photos.length ? ['images'] : ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: room,
        videoMaxDuration: MAX_VIDEO_SECONDS,
        quality: 0.8,
      });
      if (!result.canceled) take(result.assets);
    } catch {
      toast('Couldn’t open your photos.');
    }
  }

  if (media) {
    return (
      <View style={{ gap: t.space[2] }}>
        <AppText variant="label" tone="subtle">
          {media.kind === 'video' ? 'Video' : 'Boomerang'}
        </AppText>
        {media.kind === 'video' ? <VideoPlayer uri={media.uri} /> : <BoomerangPlayer frames={media.frames} />}
        <Button label={media.kind === 'video' ? 'Remove video' : 'Remove boomerang'} variant="ghost" size="md" onPress={() => onMedia(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Photos & video · optional
      </AppText>

      {photos.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {photos.map((uri, i) => (
            <View key={uri} style={{ width: 96, height: 96, borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}>
              <Image source={{ uri: display?.[uri] ?? uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                onPress={() => onPhotos(photos.filter((x) => x !== uri))}
                hitSlop={8}
                style={{ position: 'absolute', top: 4, right: 4 }}>
                <Ionicons name="close-circle" size={24} color={t.colors.text} />
              </Pressable>
            </View>
          ))}
          {room > 0 ? (
            <>
              {canCamera ? <Tile square icon="camera-outline" label="Take photo" onPress={fromCamera} /> : null}
              <Tile square icon="images-outline" label="Add photos" onPress={fromLibrary} />
            </>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          {canCamera ? <Tile icon="camera-outline" label="Take photo or video" onPress={fromCamera} /> : null}
          <Tile icon="images-outline" label="Upload photos or video" onPress={fromLibrary} />
          <Tile icon="infinite-outline" label="Boomerang" onPress={() => router.push('/boomerang')} />
        </View>
      )}
      <AppText variant="caption" tone="subtle">
        Up to {MAX_PHOTOS} photos, or one video up to {MAX_VIDEO_SECONDS} seconds.
      </AppText>
    </View>
  );
}

function Tile({ icon, label, onPress, square }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; square?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        ...(square ? { width: 96, height: 96 } : { flex: 1, minHeight: 84 }),
        borderRadius: t.radius.md,
        borderWidth: t.borderWidth.regular,
        borderStyle: 'dashed',
        borderColor: t.colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: t.space[2],
        opacity: pressed ? 0.7 : 1,
      })}>
      <Ionicons name={icon} size={24} color={t.colors.textMuted} />
      <AppText variant="caption" tone="muted" align="center">
        {label}
      </AppText>
    </Pressable>
  );
}
