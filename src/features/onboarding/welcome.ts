import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (userId: string) => `welcome_seen:${userId}`;

/** Has this member seen the welcome tour on this phone? */
export async function welcomeSeen(userId: string) {
  try {
    return (await AsyncStorage.getItem(key(userId))) === '1';
  } catch {
    return true; // Storage unavailable: don't block the app with the tour.
  }
}

export const markWelcomeSeen = (userId: string) => AsyncStorage.setItem(key(userId), '1').catch(() => undefined);
