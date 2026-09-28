import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export type Arrival = { kind: 'event' | 'place'; id: number; title: string; place: string | null };

const CHECK_EVERY_MS = 2 * 60_000;

export async function arrivalTargets() {
  const { data, error } = await supabase.rpc('arrival_targets');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function autoArrive(coords: { lat: number; lng: number; accuracy: number | null }) {
  const { data, error } = await supabase.rpc('auto_arrive', {
    p_lat: coords.lat,
    p_lng: coords.lng,
    p_accuracy_m: coords.accuracy ?? undefined,
  });
  if (error) throw error;
  return (data as unknown as Arrival[]) ?? [];
}

/**
 * "I'm In" is what you tap to say you're going. Getting there is automatic:
 * while the app is open, every couple of minutes, if you have an event or a
 * night-out place coming up, the phone reads its GPS and the server marks you
 * there when you're at the place. With no plans, GPS is never read.
 */
export function useAutoArrive(enabled: boolean) {
  const toast = useToast();
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function check() {
      if (running.current || AppState.currentState !== 'active') return;
      running.current = true;
      try {
        if ((await arrivalTargets()) === 0) return;
        const perm = await Location.getForegroundPermissionsAsync();
        const granted = perm.status === 'granted' || (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).status === 'granted');
        if (!granted || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const arrived = await autoArrive({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
        if (!cancelled) for (const a of arrived) toast(`You're there: ${a.title}`);
      } catch {
        // Try again next time; arriving is best-effort.
      } finally {
        running.current = false;
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, toast]);
}
