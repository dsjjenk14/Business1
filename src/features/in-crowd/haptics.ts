import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getProgress } from './progress';

/**
 * Game feel. Light taps for serving, a thud for trouble, a buzz when someone
 * unfollows. Phones only, respects the in-game switch, never throws.
 */
const on = Platform.OS === 'ios' || Platform.OS === 'android';
const enabled = () => on && getProgress().haptics;

export const buzz = {
  light: () => {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  medium: () => {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  heavy: () => {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  },
  select: () => {
    if (enabled()) Haptics.selectionAsync().catch(() => undefined);
  },
  success: () => {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  warning: () => {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
  error: () => {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};
