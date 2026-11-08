import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (userId: string) => `date_guide_seen:${userId}`;

/** Has this member seen the Date Mode safety guide on this phone? */
export async function dateGuideSeen(userId: string) {
  try {
    return (await AsyncStorage.getItem(key(userId))) === '1';
  } catch {
    return false; // Storage unavailable: show the guide, it's short.
  }
}

export const markDateGuideSeen = (userId: string) => AsyncStorage.setItem(key(userId), '1').catch(() => undefined);
