import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export type AvatarProps = {
  name: string;
  uri?: string | null;
  emoji?: string | null;
  size?: number;
  /** Colored ring, e.g. for someone who's live tonight. */
  ring?: 'primary' | 'trust' | 'ai' | null;
};

export function Avatar({ name, uri, emoji, size = 44, ring }: AvatarProps) {
  const t = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const ringWidth = ring ? Math.max(2, Math.round(size / 18)) : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}'s photo`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring ? ringWidth : t.style.badge === 'sticker' ? t.borderWidth.regular : 0,
        borderColor: ring ? t.colors[ring] : t.colors.outline,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : emoji ? (
        <AppText style={{ fontSize: size * 0.52, lineHeight: size * 0.66 }} accessible={false}>
          {emoji}
        </AppText>
      ) : (
        <AppText weight="bold" tone="muted" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
          {initials}
        </AppText>
      )}
    </View>
  );
}
