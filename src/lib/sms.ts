import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Opens the phone's own Messages app with the recipients and text filled in.
 * The member taps Send. (Automatic texting needs Twilio; until then this
 * works everywhere with no service.)
 */
export async function openSms(phones: string[], body: string) {
  const to = phones.join(Platform.OS === 'ios' ? ',' : ';');
  const sep = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${to}${sep}body=${encodeURIComponent(body)}`;
  await Linking.openURL(url);
}

export async function callNumber(number: string) {
  await Linking.openURL(`tel:${number}`);
}
