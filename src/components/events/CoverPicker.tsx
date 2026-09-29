import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText, Button, Glyph } from '@/components/ui';
import { useTheme } from '@/theme';

/** An event's cover photo (wide, 16:9). Empty: a tap target to add one. */
export function CoverPicker({ uri, onChange, busy }: { uri: string | null; onChange: (uri: string | null) => void; busy?: boolean }) {
  const t = useTheme();

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    const a = result.canceled ? null : result.assets[0];
    if (a) onChange(a.uri);
  }

  if (!uri) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a cover photo"
        onPress={pick}
        disabled={busy}
        style={({ pressed }) => ({
          aspectRatio: 16 / 9,
          borderRadius: t.radius.lg,
          borderWidth: t.borderWidth.regular,
          borderStyle: 'dashed',
          borderColor: t.colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[1],
          opacity: pressed ? 0.7 : 1,
        })}>
        {busy ? <ActivityIndicator color={t.colors.primary} /> : <Glyph name="camera" size={28} tone="muted" />}
        <AppText weight="bold">Add a cover photo</AppText>
        <AppText variant="caption" tone="subtle">
          Optional. Events with a photo get more people.
        </AppText>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: t.space[2] }}>
      <View style={{ aspectRatio: 16 / 9, borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" accessibilityLabel="Cover photo" />
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.overlay }}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button label="Change photo" variant="secondary" size="md" onPress={pick} disabled={busy} style={{ flex: 1 }} />
        <Button label="Remove" variant="ghost" size="md" onPress={() => onChange(null)} disabled={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
