import { supabase } from '@/lib/supabase';

export type MyVerification = {
  photo_verified_at: string | null;
  id_verified_at: string | null;
  phone_verified: boolean;
  photo_request: { status: 'pending' | 'approved' | 'declined'; review_note: string | null; submitted_at: string | null } | null;
};

export async function fetchMyVerification() {
  const { data, error } = await supabase.rpc('my_verification');
  if (error) throw error;
  return data as unknown as MyVerification;
}

export async function startPhotoCheck() {
  const { data, error } = await supabase.rpc('photo_verification_challenge');
  if (error) throw error;
  return data as unknown as { request_id: number; gesture: string };
}

/** Uploads the selfie privately (only admins can see it) and sends it for review. */
export async function submitPhotoCheck(userId: string, requestId: number, uri: string) {
  const response = await fetch(uri);
  const blob = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/${requestId}.${ext}`;
  const up = await supabase.storage.from('verifications').upload(path, blob, { contentType, upsert: true });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('submit_photo_verification', { p_request: requestId, p_path: path });
  if (error) throw error;
}
