import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';

/**
 * One shared preview player: starting a song stops the one before, like
 * Instagram. Previews stream from Apple; nothing is downloaded or saved.
 */
let player: AudioPlayer | null = null;
let current: string | null = null;
const listeners = new Set<(url: string | null) => void>();

function setCurrent(url: string | null) {
  current = url;
  listeners.forEach((l) => l(url));
}

function getPlayer() {
  if (!player) {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    player = createAudioPlayer(null);
    player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) setCurrent(null);
    });
  }
  return player;
}

export function togglePreview(url: string) {
  const p = getPlayer();
  if (current === url) {
    p.pause();
    setCurrent(null);
    return;
  }
  p.replace({ uri: url });
  p.play();
  setCurrent(url);
}

export function stopPreview() {
  if (player && current) player.pause();
  setCurrent(null);
}

/** Is this preview playing right now? Re-renders when that changes. */
export function usePreviewPlaying(url: string | null | undefined) {
  const [playing, setPlaying] = useState(!!url && current === url);
  useEffect(() => {
    const l = (u: string | null) => setPlaying(!!url && u === url);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [url]);
  return playing;
}
