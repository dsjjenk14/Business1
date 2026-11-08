import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { normalizePhone } from '@/features/safety/api';
import { supabase } from '@/lib/supabase';

/** Someone in your phone's contacts who's on I'm In. */
export type ContactOnApp = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  vouch_count: number;
  phone_hash: string;
  is_insider: boolean;
  request_sent: boolean;
  /** Their number as saved on your phone (stays on the phone; used to vouch). */
  phone: string;
};

/**
 * Finds contacts who are on I'm In. The phone sends only fingerprints
 * (SHA-256) of the numbers; the server compares them with members' verified
 * numbers and doesn't keep them. Nothing else from your contacts leaves the phone.
 */
export async function findContactsOnApp(): Promise<ContactOnApp[]> {
  const { granted } = await requestPermissionsAsync();
  if (!granted) throw new Error('Allow contacts access in Settings to find friends who are here.');
  const contacts = await Contact.getAllDetails([ContactField.PHONES] as const);
  const byHash = new Map<string, string>();
  for (const c of contacts) {
    for (const p of c.phones ?? []) {
      const n = p.number ? normalizePhone(p.number) : null;
      if (n && byHash.size < 3000) byHash.set(await digestStringAsync(CryptoDigestAlgorithm.SHA256, n), n);
    }
  }
  if (!byHash.size) return [];
  const { data, error } = await supabase.rpc('contacts_on_app', { p_hashes: [...byHash.keys()] });
  if (error) throw error;
  return ((data ?? []) as Omit<ContactOnApp, 'phone'>[]).map((r) => ({ ...r, phone: byHash.get(r.phone_hash) ?? '' }));
}

export async function sendInsiderRequest(userId: string) {
  const { error } = await supabase.rpc('send_insider_request', { p_to: userId });
  if (error) throw error;
}

export type InsiderRequest = { from_id: string; display_name: string; avatar_url: string | null; vouch_count: number; created_at: string };

export async function fetchInsiderRequests() {
  const { data, error } = await supabase.rpc('my_insider_requests');
  if (error) throw error;
  return (data ?? []) as InsiderRequest[];
}

export async function respondInsiderRequest(fromId: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_insider_request', { p_from: fromId, p_accept: accept });
  if (error) throw error;
}
