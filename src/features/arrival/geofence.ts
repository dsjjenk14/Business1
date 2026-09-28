import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

import { autoArrive, fetchArrivalRegions } from './api';

/**
 * Arriving while the app is closed (App Store build only; Expo Go can't run
 * background tasks). The phone watches a small circle around each place
 * you said I'm In to. When you walk in, iOS/Android wakes this task, which
 * reads GPS once and lets the server mark you there.
 *
 * Needs "Always" location permission, which we only ask for right after you
 * tap I'm In, with an explanation. Without it, arrival still works whenever
 * the app is open.
 */
export const ARRIVAL_TASK = 'imin-arrival';
export const GEOFENCE_SUPPORTED = Platform.OS !== 'web' && !isRunningInExpoGo();

type GeofenceData = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

if (GEOFENCE_SUPPORTED) {
  TaskManager.defineTask<GeofenceData>(ARRIVAL_TASK, async ({ data, error }) => {
    if (error || data?.eventType !== Location.GeofencingEventType.Enter) return;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const arrived = await autoArrive({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
      for (const a of arrived) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "You're there", body: a.title, data: { link: a.kind === 'event' ? `/events/${a.id}` : '/tonight' } },
          trigger: null,
        });
      }
      await syncArrivalGeofences();
    } catch {
      // Best effort: the app checks again when it's opened.
    }
  });
}

/** Watch exactly the places you have plans at (or stop watching when there are none). */
export async function syncArrivalGeofences() {
  if (!GEOFENCE_SUPPORTED) return;
  try {
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') return;
    const regions = await fetchArrivalRegions();
    if (!regions.length) {
      if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
      return;
    }
    await Location.startGeofencingAsync(
      ARRIVAL_TASK,
      regions.map((r) => ({ identifier: r.key, latitude: r.lat, longitude: r.lng, radius: r.radius_m, notifyOnEnter: true, notifyOnExit: false })),
    );
  } catch {
    // Location services off, etc. Arrival still works while the app is open.
  }
}

/**
 * Right after you tap I'm In: ask (once) for permission to notice arrival
 * with the app closed, then start watching. Returns silently if not
 * available or declined.
 */
export async function enableArrivalWatch() {
  if (!GEOFENCE_SUPPORTED) return;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted' && bg.canAskAgain) {
      // Say why before the phone asks, and what happens if they say no.
      const ok = await explain(
        'Mark you there automatically?',
        'If you allow "Always", your phone notices when you arrive at this event, even with I’m In closed, and marks you there for the people you chose. It only watches the places you said I’m In to, never anywhere else, and your exact location is never shown.',
        'Continue',
        'Not now',
      );
      if (!ok) return;
      const res = await Location.requestBackgroundPermissionsAsync();
      if (res.status !== 'granted') {
        await explain('No problem', 'You’ll still be marked there whenever I’m In is open when you arrive. You can change this any time in your phone’s Settings.', 'OK');
        return;
      }
    }
    await syncArrivalGeofences();
  } catch {
    // Ignore: arrival still works while the app is open.
  }
}

/** A native pop-up; resolves true for the main button. */
function explain(title: string, body: string, yes: string, no?: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, body, [...(no ? [{ text: no, style: 'cancel' as const, onPress: () => resolve(false) }] : []), { text: yes, onPress: () => resolve(true) }], {
      cancelable: false,
    });
  });
}
