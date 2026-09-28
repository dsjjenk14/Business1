import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CameraCapture } from '@/components/camera/CameraCapture';
import { BoomerangPlayer } from '@/components/media/BoomerangPlayer';
import { BackHeader } from '@/components/nav/AppHeader';
import { Button } from '@/components/ui';
import { setBoomerangDraft } from '@/features/media/api';
import { useTheme } from '@/theme';

/** Capture a boomerang for a post: a burst of frames played forward and back. */
export default function Boomerang() {
  const t = useTheme();
  const router = useRouter();
  const [frames, setFrames] = useState<string[] | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <BackHeader title="Boomerang" />
      {!frames ? (
        <CameraCapture mode="boomerang" onCaptured={setFrames} />
      ) : (
        <View style={{ flex: 1, padding: t.space[4], gap: t.space[3], justifyContent: 'center' }}>
          <BoomerangPlayer frames={frames} />
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label="Retake" variant="secondary" style={{ flex: 1 }} onPress={() => setFrames(null)} />
            <Button
              label="Use it"
              style={{ flex: 1 }}
              onPress={() => {
                setBoomerangDraft(frames);
                router.back();
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}
