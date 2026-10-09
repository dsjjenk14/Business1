import { supabase } from '@/lib/supabase';

export type SignUpInput = {
  fullName: string;
  phone: string;      // E.164
  email: string;
  citySlug: string;
  birthdate: string;  // YYYY-MM-DD
  password: string;
  inviteCode?: string;
  photoUri?: string | null;
};

/**
 * Creates the account. The database signup trigger builds the profile, applies
 * the invite code (remembered; you and your inviter become Insiders once you verify your phone) and marks Founding Members.
 */
export async function signUp(input: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone,
        city_slug: input.citySlug,
        birthdate: input.birthdate,
        invite_code: input.inviteCode?.trim() || undefined,
        accepted_terms: true,
      },
    },
  });
  if (error) throw error;

  // Photo upload needs a signed-in session. If email confirmation is on,
  // there is no session yet and the photo can be added later from the profile.
  if (data.session && input.photoUri) {
    try {
      await uploadAvatar(data.session.user.id, input.photoUri);
    } catch {
      // Non-fatal: the account exists; they can add a photo later.
    }
  }
  return { needsEmailConfirmation: !data.session };
}

export async function uploadAvatar(userId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId);
  if (updateError) throw updateError;
  return data.publicUrl;
}

/** Age in whole years from a YYYY-MM-DD date. */
export function ageFrom(birthdate: string, today = new Date()): number {
  const [y, m, d] = birthdate.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** Validates "MM", "DD", "YYYY" parts into YYYY-MM-DD, or null. */
export function toIsoDate(mm: string, dd: string, yyyy: string): string | null {
  const m = Number(mm), d = Number(dd), y = Number(yyyy);
  if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y) || yyyy.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900) return null;
  return `${yyyy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
