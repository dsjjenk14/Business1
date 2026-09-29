import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Small taps you feel on the phone, like other polished apps:
 *   tap     : pressing a main button
 *   select  : picking a chip, a tab, a toggle
 *   success : something went through (sent, you're in)
 * Phones only; never throws.
 */
const on = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  tap: () => {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  select: () => {
    if (on) Haptics.selectionAsync().catch(() => undefined);
  },
  success: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
