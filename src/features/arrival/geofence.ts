import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

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
    if (bg.status !== 'granted' && bg.canAskAgain) await Location.requestBackgroundPermissionsAsync();
    await syncArrivalGeofences();
  } catch {
    // Ignore: arrival still works while the app is open.
  }
}
