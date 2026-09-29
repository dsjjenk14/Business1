import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CameraCapture } from '@/components/camera/CameraCapture';
import { BoomerangPlayer } from '@/components/media/BoomerangPlayer';
import { BackHeader } from '@/components/nav/AppHeader';
import { Button } from '@/components/ui';
import { MAX_VIDEO_SECONDS, setCaptureDraft, type Motion } from '@/features/media/api';
import { useTheme } from '@/theme';

/**
 * The camera for posts: photo, video, and burst modes (boomerang, slo-mo,
 * rewind, loop). What you shoot goes back to the post you're making.
 */
export default function Camera() {
  const t = useTheme();
  const router = useRouter();
  const [burst, setBurst] = useState<{ frames: string[]; motion: Motion } | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <BackHeader title="Camera" />
      {!burst ? (
        <CameraCapture
          modes={['photo', 'video', 'boomerang', 'slowmo', 'rewind', 'loop']}
          maxVideoSeconds={MAX_VIDEO_SECONDS}
          onPhoto={(uri) => {
            setCaptureDraft({ kind: 'photo', uri });
            router.back();
          }}
          onVideo={(uri, durationS) => {
            setCaptureDraft({ kind: 'video', uri, durationS });
            router.back();
          }}
          onMotion={(frames, motion) => setBurst({ frames, motion })}
        />
      ) : (
        <View style={{ flex: 1, padding: t.space[4], gap: t.space[3], justifyContent: 'center' }}>
          <BoomerangPlayer frames={burst.frames} motion={burst.motion} />
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label="Retake" variant="secondary" style={{ flex: 1 }} onPress={() => setBurst(null)} />
            <Button
              label="Use it"
              style={{ flex: 1 }}
              onPress={() => {
                setCaptureDraft({ kind: 'motion', ...burst });
                router.back();
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}
