import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { BoomerangPlayer } from '@/components/media/BoomerangPlayer';
import { EffectChips, FilterChips } from '@/components/media/LookChips';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { AppText, Button, Chip, useToast } from '@/components/ui';
import { MAX_VIDEO_SECONDS, MOTIONS, onCaptureDraft, takeCaptureDraft, type MediaDraft } from '@/features/media/api';
import { applyFilter } from '@/features/photos/applyFilter';
import type { FilterKey } from '@/features/photos/filters';
import { MAX_PHOTOS } from '@/features/pins/api';
import { useTheme } from '@/theme';

export type { MediaDraft };

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
// Burst frames are small; keep them small after a filter too.
const FRAME_SIDE = 1080;

/**
 * One place for everything visual on a pin. The camera does photos, video,
 * and burst modes (boomerang, slo-mo, rewind, loop); upload picks photos or a
 * video from the phone. A pin has up to 6 photos, or one video, or one burst.
 * Videos get effects; bursts get filters, effects and a playback style.
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
  const [busy, setBusy] = useState(false);
  const current = useRef({ photos, onPhotos, onMedia, toast });
  useEffect(() => {
    current.current = { photos, onPhotos, onMedia, toast };
  });

  // Pick up what was shot on the camera screen.
  useEffect(() => {
    const use = () => {
      const d = takeCaptureDraft();
      if (!d) return;
      const { photos: now, onPhotos: setPhotos, onMedia: setMedia, toast: say } = current.current;
      if (d.kind === 'photo') {
        if (now.length >= MAX_PHOTOS) return say(`Up to ${MAX_PHOTOS} photos per pin.`);
        setPhotos([...now, d.uri]);
        return;
      }
      if (now.length) return say('A pin can have photos or a video, not both. Remove the photos first.');
      if (d.kind === 'video') setMedia({ kind: 'video', uri: d.uri, durationS: d.durationS });
      else setMedia({ kind: 'boomerang', frames: d.frames, original: d.frames, motion: d.motion });
    };
    use();
    return onCaptureDraft(use);
  }, []);

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

  async function filterBurst(key: FilterKey) {
    if (media?.kind !== 'boomerang') return;
    const original = media.original ?? media.frames;
    setBusy(true);
    try {
      const frames = key === 'none' ? original : await Promise.all(original.map((f) => applyFilter(f, key, FRAME_SIDE)));
      onMedia({ ...media, frames, original, filter: key });
    } catch {
      toast('Couldn’t apply that filter.');
    } finally {
      setBusy(false);
    }
  }

  if (media) {
    return (
      <View style={{ gap: t.space[3] }}>
        <AppText variant="label" tone="subtle">
          {media.kind === 'video' ? 'Video' : 'Your shot'}
        </AppText>
        <View>
          {media.kind === 'video' ? (
            <VideoPlayer uri={media.uri} effect={media.effect} />
          ) : (
            <BoomerangPlayer frames={media.frames} motion={media.motion} effect={media.effect} />
          )}
          {busy ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
        </View>
        {media.kind === 'boomerang' ? (
          <>
            <View style={{ gap: t.space[2] }}>
              <AppText variant="label" tone="subtle">
                Style
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
                {MOTIONS.map((m) => (
                  <Chip key={m.key} label={m.label} selected={media.motion === m.key} onPress={() => onMedia({ ...media, motion: m.key })} />
                ))}
              </ScrollView>
            </View>
            <FilterChips value={media.filter ?? 'none'} onChange={filterBurst} busy={busy} />
          </>
        ) : null}
        <EffectChips value={media.effect ?? 'none'} onChange={(effect) => onMedia({ ...media, effect })} busy={busy} />
        <Button label={media.kind === 'video' ? 'Remove video' : 'Remove'} variant="ghost" size="md" onPress={() => onMedia(null)} />
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
              <Tile square icon="camera-outline" label="Take photo" onPress={() => router.push('/camera')} />
              <Tile square icon="images-outline" label="Add photos" onPress={fromLibrary} />
            </>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <Tile icon="camera-outline" label="Camera" sub="Photo, video, boomerang, slo-mo" onPress={() => router.push('/camera')} />
          <Tile icon="images-outline" label="Upload" sub="Photos or a video" onPress={fromLibrary} />
        </View>
      )}
      <AppText variant="caption" tone="subtle">
        Up to {MAX_PHOTOS} photos, or one video up to {MAX_VIDEO_SECONDS} seconds, or one boomerang. Add filters and effects after.
      </AppText>
    </View>
  );
}

function Tile({ icon, label, sub, onPress, square }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; square?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}: ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        ...(square ? { width: 96, height: 96 } : { flex: 1, minHeight: 96 }),
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
      <AppText variant="caption" weight="bold" align="center">
        {label}
      </AppText>
      {sub ? (
        <AppText variant="caption" tone="muted" align="center">
          {sub}
        </AppText>
      ) : null}
    </Pressable>
  );
}
