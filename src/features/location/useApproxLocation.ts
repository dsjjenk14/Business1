import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type ApproxLocation = { lat: number; lng: number };

/**
 * The phone's location, at low accuracy, only while the app is open.
 * The server snaps anything shared to a ~quarter-mile grid, so this is only
 * used to measure distances. If permission is denied we return null and the
 * server falls back to the member's profile location.
 */
export function useApproxLocation() {
  const [location, setLocation] = useState<ApproxLocation | null>(null);
  const [status, setStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  const refresh = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        return null;
      }
      setStatus('granted');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(next);
      return next;
    } catch {
      setStatus('denied');
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm.status !== 'granted') {
          setStatus('denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setStatus('granted');
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { location, status, refresh };
}
