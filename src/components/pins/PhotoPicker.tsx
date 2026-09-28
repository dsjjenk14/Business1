import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { MAX_PHOTOS } from '@/features/pins/api';
import { useTheme } from '@/theme';

/** Pick up to 6 photos from the library, with thumbnails you can remove. */
export function PhotoPicker({
  photos,
  onChange,
  display,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  /** What to show for each photo (e.g. with its filter). */
  display?: Record<string, string>;
}) {
  const t = useTheme();

  async function addPhotos() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (!result.canceled) onChange([...photos, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  }

  return (
        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="subtle">
            Photos · optional · up to {MAX_PHOTOS}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {photos.map((uri, i) => (
              <View key={uri} style={{ width: 96, height: 96, borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}>
                <Image source={{ uri: display?.[uri] ?? uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => onChange(photos.filter((x) => x !== uri))}
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
  );
}
