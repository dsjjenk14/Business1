import { supabase } from '@/lib/supabase';

export type ConnectCode = { code: string; kind: 'qr' | 'code'; expires_at: string };
export type ConnectResult = {
  status: 'connected' | 'already';
  kind: 'qr' | 'code';
  encounter_id: number | null;
  user: { id: string; display_name: string; avatar_url: string | null };
};

/** In person: a QR the other person scans (works for 5 minutes). Outside the app: a 6-character code to share (24 hours). */
export async function createConnectCode(kind: 'qr' | 'code') {
  const { data, error } = await supabase.rpc('create_connect_code', { p_kind: kind });
  if (error) throw error;
  return data as unknown as ConnectCode;
}

export async function redeemConnectCode(code: string) {
  const { data, error } = await supabase.rpc('redeem_connect_code', { p_code: code });
  if (error) throw error;
  return data as unknown as ConnectResult;
}

/** What a QR holds: a link that opens the app (or the store) right to connecting. */
export const qrLink = (code: string) => `imin://connect/${code}`;

/** Pull the code out of a scanned QR (our link, or a bare code). */
export function codeFromScan(data: string) {
  const m = data.trim().match(/connect\/([A-Za-z0-9]+)\s*$/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{6,16}$/.test(data.trim()) ? data.trim() : null;
}

/** Shared codes are shown as ABC-123 so they're easy to read out. */
export const prettyCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);
