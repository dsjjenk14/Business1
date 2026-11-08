import { supabase } from '@/lib/supabase';

/** Most profile photos you can have; the app rotates through them. */
export const MAX_PROFILE_PHOTOS = 3;

/** Upload one profile photo to your folder and return its link (it isn't shown until saved). */
export async function uploadProfilePhoto(userId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export type SavedPhotos = {
  /** What everyone sees now. */
  photos: string[];
  /** New photos waiting for a reviewer, once you're photo verified. Null when nothing is waiting. */
  pending: string[] | null;
};

/**
 * Save your photos in order (1 to 3). The first is your main photo. After your
 * photo check, a set with a new photo waits for a reviewer before anyone sees it.
 */
export async function saveProfilePhotos(urls: string[]) {
  const { data, error } = await supabase.rpc('set_profile_photos', { p_urls: urls });
  if (error) throw error;
  const d = (data ?? {}) as { photos?: string[] | null; pending?: string[] | null };
  return { photos: d.photos ?? [], pending: d.pending ?? null } satisfies SavedPhotos;
}

/** New photos you sent that are still waiting for a reviewer. */
export async function fetchPendingPhotos(userId: string) {
  const { data, error } = await supabase.from('pending_photos').select('photo_urls').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.photo_urls ?? null;
}

/** Take back new photos that are waiting for review. */
export async function cancelPendingPhotos() {
  const { error } = await supabase.rpc('cancel_pending_photos');
  if (error) throw error;
}
