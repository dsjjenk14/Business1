import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, View } from 'react-native';

import { AppText, EmptyState, useToast } from '@/components/ui';
import { BOOMERANG_FRAMES } from '@/features/media/api';
import { useTheme } from '@/theme';

/** Longest video an Out can be. */
export const MAX_OUT_VIDEO_SECONDS = 9;

/**
 * Full-screen camera. "photo" takes one picture (Outs); "boomerang" takes a
 * quick burst of frames that play forward and back. With `onVideo`, a
 * Photo / Video switch appears: video records up to 9 seconds (tap to stop
 * early), and the gallery button can pick a photo or a short video.
 */
export function CameraCapture({
  mode,
  onCaptured,
  onVideo,
}: {
  mode: 'photo' | 'boomerang';
  onCaptured: (uris: string[]) => void;
  onVideo?: (uri: string, durationS: number | null) => void;
}) {
  const t = useTheme();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const toast = useToast();
  const [progress, setProgress] = useState(0);
  // Video (Outs only). Recording in a browser isn't supported, so the web offers the gallery instead.
  const canRecord = !!onVideo && Platform.OS !== 'web';
  const [kind, setKind] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [mic, requestMic] = useMicrophonePermissions();
  const [bar] = useState(() => new Animated.Value(0));
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) {
      bar.setValue(0);
      return;
    }
    const anim = Animated.timing(bar, { toValue: 1, duration: MAX_OUT_VIDEO_SECONDS * 1000, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [recording, bar]);

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

  async function chooseVideo() {
    setKind('video');
    if (mic && !mic.granted && mic.canAskAgain) await requestMic().catch(() => undefined);
  }

  async function record() {
    if (!cam.current || !ready) return;
    if (recording) {
      cam.current.stopRecording();
      return;
    }
    setRecording(true);
    startedAt.current = Date.now();
    try {
      const video = await cam.current.recordAsync({ maxDuration: MAX_OUT_VIDEO_SECONDS });
      const seconds = Math.min(MAX_OUT_VIDEO_SECONDS, (Date.now() - startedAt.current) / 1000);
      if (video?.uri && seconds >= 0.5) onVideo?.(video.uri, Math.round(seconds * 10) / 10);
      else if (video?.uri) toast('Hold on a little longer to record.');
    } catch {
      toast('Couldn’t record. Try again.');
    } finally {
      setRecording(false);
    }
  }

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: onVideo ? ['images', 'videos'] : ['images'],
        videoMaxDuration: MAX_OUT_VIDEO_SECONDS,
        quality: 0.8,
      });
      const a = result.canceled ? null : result.assets[0];
      if (!a) return;
      if (a.type === 'video') {
        const seconds = a.duration != null ? a.duration / 1000 : null;
        if (seconds != null && seconds > MAX_OUT_VIDEO_SECONDS + 0.5) return toast(`Videos can be up to ${MAX_OUT_VIDEO_SECONDS} seconds.`);
        onVideo?.(a.uri, seconds);
      } else {
        onCaptured([a.uri]);
      }
    } catch {
      toast('Couldn’t open that.');
    }
  }

  async function shoot() {
    if (kind === 'video') return record();
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
        animateShutter={mode === 'photo' && kind === 'photo'}
        mode={kind === 'video' ? 'video' : 'picture'}
        mute={kind === 'video' && !mic?.granted}
        onCameraReady={() => setReady(true)}
      />
      {recording ? (
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <Animated.View style={{ height: 4, backgroundColor: t.colors.primary, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center', gap: t.space[3] }}>
        {mode === 'boomerang' ? (
          <AppText weight="bold" style={{ color: '#FFFFFF' }}>
            {busy ? `Capturing… ${Math.round(progress * 100)}%` : 'Tap to capture a boomerang'}
          </AppText>
        ) : null}
        {canRecord && !recording ? (
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: t.space[5] }}>
            {(['photo', 'video'] as const).map((k) => (
              <Pressable
                key={k}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === k }}
                onPress={() => (k === 'video' ? chooseVideo() : setKind('photo'))}
                hitSlop={10}>
                <AppText weight="bold" style={{ color: kind === k ? '#FFD60A' : '#FFFFFF', letterSpacing: 0.5 }}>
                  {k === 'photo' ? 'PHOTO' : 'VIDEO'}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40 }}>
          {onVideo || mode === 'photo' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={onVideo ? 'Pick a photo or video' : 'Pick a photo'}
              onPress={pickFromGallery}
              disabled={recording}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: recording ? 0 : 1 }}>
              <Ionicons name="images-outline" size={28} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'boomerang' ? 'Capture boomerang' : kind === 'video' ? (recording ? 'Stop recording' : `Record video, up to ${MAX_OUT_VIDEO_SECONDS} seconds`) : 'Take photo'
            }
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
              backgroundColor: busy ? t.colors.primary : kind === 'video' ? 'rgba(214,40,40,0.35)' : 'rgba(255,255,255,0.2)',
            }}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : kind === 'video' ? (
              <View style={{ width: recording ? 28 : 56, height: recording ? 28 : 56, borderRadius: recording ? 6 : 28, backgroundColor: t.colors.primary }} />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            disabled={recording}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: recording ? 0 : 1 }}>
            <Ionicons name="camera-reverse-outline" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
