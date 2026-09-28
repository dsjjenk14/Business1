import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { pinMusic, type Song } from '@/features/music/api';
import { togglePreview, usePreviewPlaying } from '@/features/music/player';
import { useTheme } from '@/theme';

/**
 * A song on a post: cover, title and artist, play/pause for the 30-second
 * preview, and a link to the full song on Apple Music.
 */
export function MusicChip({ song, onRemove }: { song: Song; onRemove?: () => void }) {
  const t = useTheme();
  const playing = usePreviewPlaying(song.preview_url);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        padding: t.space[2],
        borderRadius: t.radius.md,
        backgroundColor: t.colors.surfaceAlt,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Pause' : 'Play'} ${song.title} by ${song.artist}`}
        onPress={() => togglePreview(song.preview_url)}
        style={{ width: 44, height: 44, borderRadius: t.radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {song.artwork_url ? (
          <Image source={{ uri: song.artwork_url }} style={{ position: 'absolute', width: 44, height: 44 }} contentFit="cover" accessible={false} />
        ) : null}
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#FFFFFF" />
        </View>
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="small" weight="bold" numberOfLines={1}>
          {song.title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {song.artist}
        </AppText>
      </View>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Remove song" onPress={onRemove} hitSlop={8} style={{ padding: t.space[2] }}>
          <Ionicons name="close" size={18} color={t.colors.textMuted} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Listen to ${song.title} on Apple Music`}
          onPress={() => Linking.openURL(song.apple_url)}
          hitSlop={8}
          style={{ paddingHorizontal: t.space[2], paddingVertical: t.space[2] }}>
          <AppText variant="caption" tone="primary" weight="bold">
            Apple Music
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

/** Shows a post's song, if it has one. */
export function PinMusic({ pinId }: { pinId: number }) {
  const [song, setSong] = useState<Song | null>(null);
  useEffect(() => {
    let alive = true;
    pinMusic(pinId).then((s) => alive && setSong(s));
    return () => {
      alive = false;
    };
  }, [pinId]);
  return song ? <MusicChip song={song} /> : null;
}
