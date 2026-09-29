import { Platform } from 'react-native';

/** The web version of the app (used to open voice and video rooms from phones). */
export const WEB_URL =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://imin-dc.expo.app');
