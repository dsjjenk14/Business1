import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText, EmptyState, useToast } from '@/components/ui';
import { BOOMERANG_FRAMES } from '@/features/media/api';
import { useTheme } from '@/theme';

/**
 * Full-screen camera. "photo" takes one picture (Outs); "boomerang" takes a
 * quick burst of frames that play forward and back.
 */
export function CameraCapture({ mode, onCaptured }: { mode: 'photo' | 'boomerang'; onCaptured: (uris: string[]) => void }) {
  const t = useTheme();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const toast = useToast();
  const [progress, setProgress] = useState(0);

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: t.space[5], backgroundColor: t.colors.bg }}>
        <EmptyState
          glyph="camera"
          title="Camera is off"
          body="Allow the camera to take Outs and boomerangs."
          action={{ label: 'Allow camera', onPress: requestPermission }}
        />
      </View>
    );
  }

  async function shoot() {
    if (!cam.current || busy || !ready) return;
    setBusy(true);
    try {
      if (mode === 'photo') {
        const pic = await cam.current.takePictureAsync({ quality: 0.8, shutterSound: false });
        if (pic?.uri) onCaptured([pic.uri]);
      } else {
        const frames: string[] = [];
        for (let i = 0; i < BOOMERANG_FRAMES; i++) {
          const pic = await cam.current.takePictureAsync({ quality: 0.45, skipProcessing: true, shutterSound: false });
          if (pic?.uri) frames.push(pic.uri);
          setProgress((i + 1) / BOOMERANG_FRAMES);
        }
        if (frames.length >= 3) onCaptured(frames);
      }
    } catch {
      toast('The camera isn’t ready. Try again in a second.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <CameraView
        ref={cam}
        style={{ flex: 1 }}
        facing={facing}
        mirror={facing === 'front'}
        animateShutter={mode === 'photo'}
        onCameraReady={() => setReady(true)}
      />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center', gap: t.space[3] }}>
        {mode === 'boomerang' ? (
          <AppText weight="bold" style={{ color: '#FFFFFF' }}>
            {busy ? `Capturing… ${Math.round(progress * 100)}%` : 'Tap to capture a boomerang'}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40 }}>
          <View style={{ width: 44 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === 'photo' ? 'Take photo' : 'Capture boomerang'}
            onPress={shoot}
            disabled={busy || !ready}
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              borderWidth: 5,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: busy ? t.colors.primary : 'rgba(255,255,255,0.2)',
            }}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera-reverse-outline" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
