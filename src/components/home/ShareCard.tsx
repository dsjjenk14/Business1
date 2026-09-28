import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Glyph } from '@/components/ui';
import { useTheme } from '@/theme';

/** "What's on your mind?": the quickest way to post a pin, right on Home. */
export function ShareCard({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share something: drop a pin"
      onPress={() => router.push('/pins/new')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        padding: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: t.borderWidth.hairline,
        borderColor: t.colors.border,
        backgroundColor: t.colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Avatar name={name} uri={avatarUrl} size={40} />
      <View style={{ flex: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: t.space[3], borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceAlt }}>
        <AppText tone="muted">What&apos;s on your mind?</AppText>
      </View>
      <Glyph name="pin" size={22} color={t.colors.primaryText} />
    </Pressable>
  );
}
