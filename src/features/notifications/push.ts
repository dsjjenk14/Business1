import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Phones only: web has no push, and Android push was removed from Expo Go (it works in the store build). */
export const PUSH_SUPPORTED = Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

let currentToken: string | null = null;

if (PUSH_SUPPORTED) {
  // While the app is open, still show the banner (the in-app bell updates too).
  Notifications.setNotificationHandler({
    // While the app is open, the app plays its own I'm In chime instead (see useUnreadCounts).
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
}

/**
 * Ask for permission (once; iOS never asks twice) and register this phone
 * for push. Safe to call on every launch. Returns false when push is off.
 */
export async function registerForPush(): Promise<boolean> {
  if (!PUSH_SUPPORTED || !Device.isDevice) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'I’m In',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return true;
  } catch {
    return false; // No network, simulator, etc. We'll try again next launch.
  }
}

/** Before signing out: stop pushes to this phone for this account. */
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken }).then(
    () => undefined,
    () => undefined,
  );
  currentToken = null;
}
