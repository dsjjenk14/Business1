import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { supabase } from '@/lib/supabase';

/**
 * In-app sounds: the I'm In chime when something new arrives while the app is
 * open, and a soft blip when you send. Members can turn them off in
 * Settings → Notifications (user_settings.app_sounds).
 */
const FILES = {
  in: require('../../../assets/sounds/in.wav'),
  sent: require('../../../assets/sounds/sent.wav'),
};
export type SoundName = keyof typeof FILES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let enabled = true;
let lastIn = 0;

/** Load the member's setting (call after sign-in). */
export async function loadSoundSetting(userId: string) {
  const { data } = await supabase.from('user_settings').select('app_sounds').eq('user_id', userId).maybeSingle();
  enabled = data?.app_sounds ?? true;
}
export function setSoundsEnabled(on: boolean) {
  enabled = on;
}
export const soundsEnabled = () => enabled;

export function playSound(name: SoundName) {
  if (!enabled) return;
  // Several things can arrive at once (a push and the live update): chime once.
  if (name === 'in') {
    const now = Date.now();
    if (now - lastIn < 1500) return;
    lastIn = now;
  }
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(FILES[name]);
      p.volume = 0.7;
      players[name] = p;
    }
    p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // Sounds are a nicety; never let them break anything.
  }
}
