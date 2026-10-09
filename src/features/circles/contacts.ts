import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

import { normalizePhone } from '@/features/safety/api';

export const canPickContacts = Platform.OS !== 'web';

/**
 * Opens the phone's contact picker and returns the numbers saved for the one
 * contact picked (E.164), or null if cancelled. Nothing else is read.
 */
export async function pickContactPhones(): Promise<string[] | null> {
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  let phones;
  try {
    phones = await contact.getPhones();
  } catch {
    // Some phones need contacts permission to read the picked contact's numbers.
    const { granted } = await requestPermissionsAsync();
    if (!granted) throw new Error('Allow contacts access in Settings to vouch from your contacts.');
    phones = await contact.getPhones();
  }
  const numbers = phones.map((p) => (p.number ? normalizePhone(p.number) : null)).filter((n): n is string => !!n);
  return [...new Set(numbers)];
}
