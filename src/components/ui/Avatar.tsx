import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { STATUS_COLORS, STATUS_LABELS, usePersonInfo } from '@/features/people/status';
import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { look, tintFor } from './look';

export type AvatarProps = {
  name: string;
  uri?: string | null;
  size?: number;
  /** Colored ring, e.g. for someone who's live tonight. */
  ring?: 'primary' | 'trust' | 'ai' | null;
  /**
   * Whose photo this is. With it, the ring shows what they're up to right now
   * (live, in a virtual event, out) and their photos rotate every 25 seconds
   * if they have more than one.
   */
  userId?: string | null;
};

/** How long each profile photo shows before the next one. */
export const PHOTO_ROTATE_MS = 25_000;

export function Avatar({ name, uri, size = 44, ring, userId }: AvatarProps) {
  const t = useTheme();
  const info = usePersonInfo(userId);
  const photos = info?.photos.length ? info.photos : null;
  const many = (photos?.length ?? 0) > 1;
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!many) return;
    const timer = setInterval(() => setTurn((n) => n + 1), PHOTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [many]);
  const shown = photos ? photos[turn % photos.length] : uri;
  const status = info?.status ?? null;

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  // What someone's up to right now wins over any other ring.
  const ringColor = status ? STATUS_COLORS[status] : ring ? t.colors[ring] : null;
  const ringWidth = ringColor ? Math.max(status ? 3 : 2, Math.round(size / (status ? 14 : 18))) : 0;
  // Each person gets their own steady color for their initials.
  const tint = look(t).flat ? tintFor(t, name) : null;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={status ? `${name}'s photo, ${STATUS_LABELS[status].toLowerCase()}` : `${name}'s photo`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ringWidth,
        borderColor: ringColor ?? 'transparent',
        backgroundColor: tint?.bg ?? t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {shown ? (
        <Image source={{ uri: shown }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={600} />
      ) : tint ? (
        <AppText style={{ ...fontStyle(t.fonts.display), color: tint.fg, fontSize: size * 0.38, lineHeight: size * 0.46, letterSpacing: -0.3 }}>
          {initials}
        </AppText>
      ) : (
        <AppText weight="bold" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
          {initials}
        </AppText>
      )}
    </View>
  );
}
