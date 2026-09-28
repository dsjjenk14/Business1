import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText, Button, TextField } from '@/components/ui';
import { searchSongs, type Song } from '@/features/music/api';
import { stopPreview, togglePreview, usePreviewPlaying } from '@/features/music/player';
import { useTheme } from '@/theme';

import { MusicChip } from './MusicChip';

/** Add a song to a photo post: search Apple Music, preview, pick one. */
export function MusicPicker({ value, onChange }: { value: Song | null; onChange: (song: Song | null) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search as you type, after a short pause.
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchSongs(q)
        .then(setSongs)
        .catch((e) => setError(e instanceof Error ? e.message : 'Song search isn’t available right now.'))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [q, open]);

  useEffect(() => stopPreview, []);

  if (value) {
    return (
      <View style={{ gap: t.space[1] }}>
        <AppText variant="label" tone="subtle">
          Music
        </AppText>
        <MusicChip song={value} onRemove={() => onChange(null)} />
      </View>
    );
  }

  if (!open) {
    return (
      <Button
        label="Add music"
        variant="secondary"
        size="md"
        icon={<Ionicons name="musical-notes" size={18} color={t.colors.text} />}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <View style={{ gap: t.space[2] }}>
      <TextField label="Search songs" value={q} onChangeText={setQ} placeholder="Song or artist" autoFocus returnKeyType="search" />
      <AppText variant="caption" tone="subtle">
        A 30-second clip plays with your post, with a link to the song on Apple Music.
      </AppText>
      {loading ? <ActivityIndicator color={t.colors.primary} /> : null}
      {error ? (
        <AppText variant="small" tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      {songs.map((s) => (
        <SongRow
          key={s.track_id}
          song={s}
          onPick={() => {
            stopPreview();
            onChange(s);
            setOpen(false);
          }}
        />
      ))}
      <Button
        label="Cancel"
        variant="ghost"
        size="md"
        onPress={() => {
          stopPreview();
          setOpen(false);
        }}
      />
    </View>
  );
}

function SongRow({ song, onPick }: { song: Song; onPick: () => void }) {
  const t = useTheme();
  const playing = usePreviewPlaying(song.preview_url);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: 52 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Pause' : 'Preview'} ${song.title} by ${song.artist}`}
        onPress={() => togglePreview(song.preview_url)}
        style={{ width: 44, height: 44, borderRadius: t.radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceAlt }}>
        {song.artwork_url ? (
          <Image source={{ uri: song.artwork_url }} style={{ position: 'absolute', width: 44, height: 44 }} contentFit="cover" accessible={false} />
        ) : null}
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="small" weight="bold" numberOfLines={1}>
          {song.title}
          {song.explicit ? ' (E)' : ''}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {song.artist}
        </AppText>
      </View>
      <Button label="Use" size="md" variant="secondary" accessibilityLabel={`Use ${song.title}`} onPress={onPick} />
    </View>
  );
}
