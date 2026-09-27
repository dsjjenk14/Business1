import { supabase } from '@/lib/supabase';

export type ProfileCard = {
  id: string;
  full_name: string;
  display_name: string;
  headline: string;
  bio: string;
  pronouns: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  neighborhood: string | null;
  city_name: string | null;
  age: number | null;
  is_founding_member: boolean;
  member_number: number;
  is_premium: boolean;
  id_verified: boolean;
  photo_verified: boolean;
  vouch_count: number | null;
  top_vouch_word: string | null;
  is_me: boolean;
  degree: 0 | 1 | 2 | null;
  via: { id: string; display_name: string; avatar_emoji: string | null }[];
  can_message: boolean;
  circle_count: number;
  intros_made: number;
  tonight: { place: string | null; neighborhood: string | null; starts_at: string; is_hosting: boolean; note: string | null } | null;
  groups: { id: number; name: string; emoji: string; role: string; schedule: string | null }[];
  vouches: {
    voucher_id: string;
    display_name: string;
    avatar_emoji: string | null;
    avatar_url: string | null;
    word: string | null;
    type: 'gps' | 'invite';
    place: string | null;
    created_at: string;
  }[];
};

export async function fetchProfileCard(userId: string): Promise<ProfileCard | null> {
  const { data, error } = await supabase.rpc('profile_card', { p_user: userId });
  if (error) throw error;
  return (data as ProfileCard | null) ?? null;
}
