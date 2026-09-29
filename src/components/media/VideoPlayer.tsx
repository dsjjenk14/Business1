import { useVideoPlayer, VideoView } from 'expo-video';
import { View } from 'react-native';

import type { EffectKey } from '@/features/photos/effects';
import { useTheme } from '@/theme';

import { EffectOverlay } from './EffectOverlay';

/** A post's video: starts muted and loops; tap for controls and sound. Its effect is drawn on top. */
export function VideoPlayer({ uri, rounded = true, autoPlay = false, effect }: { uri: string; rounded?: boolean; autoPlay?: boolean; effect?: EffectKey | null }) {
  const t = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    if (autoPlay) p.play();
  });
  return (
    <View style={{ aspectRatio: 4 / 5, width: '100%', overflow: 'hidden', borderRadius: rounded ? t.radius.md : 0, backgroundColor: '#000000' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls accessibilityLabel="Video" />
      <EffectOverlay effect={effect} />
    </View>
  );
}
