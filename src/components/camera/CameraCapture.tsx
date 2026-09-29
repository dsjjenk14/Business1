import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, View } from 'react-native';

import { AppText, EmptyState, useToast } from '@/components/ui';
import { BOOMERANG_FRAMES, MOTIONS, type Motion } from '@/features/media/api';
import { useTheme } from '@/theme';

/** Longest video an Out can be. */
export const MAX_OUT_VIDEO_SECONDS = 9;

export type CaptureMode = 'photo' | 'video' | Motion;

const LABEL: Record<CaptureMode, string> = {
  photo: 'PHOTO',
  video: 'VIDEO',
  boomerang: 'BOOMERANG',
  slowmo: 'SLO-MO',
  rewind: 'REWIND',
  loop: 'LOOP',
};
const isMotion = (m: CaptureMode): m is Motion => MOTIONS.some((x) => x.key === m);

/**
 * Full-screen camera with a row of modes: photo, video (up to
 * `maxVideoSeconds`, tap to stop early), and burst modes that shoot a quick
 * run of frames: boomerang, slo-mo, rewind and loop. The gallery button picks
 * a photo (or a short video when video is one of the modes).
 */
export function CameraCapture({
  modes,
  maxVideoSeconds = MAX_OUT_VIDEO_SECONDS,
  onPhoto,
  onVideo,
  onMotion,
}: {
  modes: CaptureMode[];
  maxVideoSeconds?: number;
  onPhoto?: (uri: string) => void;
  onVideo?: (uri: string, durationS: number | null) => void;
  onMotion?: (frames: string[], motion: Motion) => void;
}) {
  const t = useTheme();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const toast = useToast();
  const [progress, setProgress] = useState(0);
  // Recording in a browser isn't supported, so the web offers the gallery for video instead.
  const available = modes.filter((m) => (m === 'video' ? Platform.OS !== 'web' && !!onVideo : true));
  const [mode, setMode] = useState<CaptureMode>(available[0] ?? 'photo');
  const [recording, setRecording] = useState(false);
  const [mic, requestMic] = useMicrophonePermissions();
  const [bar] = useState(() => new Animated.Value(0));
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) {
      bar.setValue(0);
      return;
    }
    const anim = Animated.timing(bar, { toValue: 1, duration: maxVideoSeconds * 1000, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [recording, bar, maxVideoSeconds]);

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: t.space[5], backgroundColor: t.colors.bg }}>
        <EmptyState glyph="camera" title="Camera is off" body="Allow the camera to take photos, videos and boomerangs." action={{ label: 'Allow camera', onPress: requestPermission }} />
      </View>
    );
  }

  async function pickMode(m: CaptureMode) {
    setMode(m);
    if (m === 'video' && mic && !mic.granted && mic.canAskAgain) await requestMic().catch(() => undefined);
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
      const video = await cam.current.recordAsync({ maxDuration: maxVideoSeconds });
      const seconds = Math.min(maxVideoSeconds, (Date.now() - startedAt.current) / 1000);
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
        videoMaxDuration: maxVideoSeconds,
        quality: 0.8,
      });
      const a = result.canceled ? null : result.assets[0];
      if (!a) return;
      if (a.type === 'video') {
        const seconds = a.duration != null ? a.duration / 1000 : null;
        if (seconds != null && seconds > maxVideoSeconds + 0.5) return toast(`Videos can be up to ${maxVideoSeconds} seconds.`);
        onVideo?.(a.uri, seconds);
      } else {
        onPhoto?.(a.uri);
      }
    } catch {
      toast('Couldn’t open that.');
    }
  }

  async function shoot() {
    if (mode === 'video') return record();
    if (!cam.current || busy || !ready) return;
    setBusy(true);
    try {
      if (mode === 'photo') {
        const pic = await cam.current.takePictureAsync({ quality: 0.8, shutterSound: false });
        if (pic?.uri) onPhoto?.(pic.uri);
      } else {
        const frames: string[] = [];
        for (let i = 0; i < BOOMERANG_FRAMES; i++) {
          const pic = await cam.current.takePictureAsync({ quality: 0.45, skipProcessing: true, shutterSound: false });
          if (pic?.uri) frames.push(pic.uri);
          setProgress((i + 1) / BOOMERANG_FRAMES);
        }
        if (frames.length >= 3) onMotion?.(frames, mode);
      }
    } catch {
      toast('The camera isn’t ready. Try again in a second.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  const shutterLabel =
    mode === 'video' ? (recording ? 'Stop recording' : `Record video, up to ${maxVideoSeconds} seconds`) : mode === 'photo' ? 'Take photo' : `Capture ${LABEL[mode].toLowerCase()}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <CameraView
        ref={cam}
        style={{ flex: 1 }}
        facing={facing}
        mirror={facing === 'front'}
        animateShutter={mode === 'photo'}
        mode={mode === 'video' ? 'video' : 'picture'}
        mute={mode === 'video' && !mic?.granted}
        onCameraReady={() => setReady(true)}
      />
      {recording ? (
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <Animated.View style={{ height: 4, backgroundColor: t.colors.primary, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center', gap: t.space[3] }}>
        {isMotion(mode) ? (
          <AppText weight="bold" style={{ color: '#FFFFFF' }}>
            {busy ? `Capturing… ${Math.round(progress * 100)}%` : 'Tap and hold still for a second'}
          </AppText>
        ) : null}
        {available.length > 1 && !recording && !busy ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[5], paddingHorizontal: t.space[5] }} accessibilityRole="tablist">
            {available.map((k) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: mode === k }} onPress={() => pickMode(k)} hitSlop={10}>
                <AppText weight="bold" style={{ color: mode === k ? '#FFD60A' : '#FFFFFF', letterSpacing: 0.5 }}>
                  {LABEL[k]}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40 }}>
          {onPhoto || onVideo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={onVideo ? 'Pick a photo or video' : 'Pick a photo'}
              onPress={pickFromGallery}
              disabled={recording || busy}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: recording ? 0 : 1 }}>
              <Ionicons name="images-outline" size={28} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shutterLabel}
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
              backgroundColor: busy ? t.colors.primary : mode === 'video' ? 'rgba(214,40,40,0.35)' : 'rgba(255,255,255,0.2)',
            }}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : mode === 'video' ? (
              <View style={{ width: recording ? 28 : 56, height: recording ? 28 : 56, borderRadius: recording ? 6 : 28, backgroundColor: t.colors.primary }} />
            ) : isMotion(mode) ? (
              <Ionicons name="infinite" size={30} color="#FFFFFF" />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            disabled={recording || busy}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: recording ? 0 : 1 }}>
            <Ionicons name="camera-reverse-outline" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
