import { supabase } from '@/lib/supabase';

/** Notable: verified public figures. "Notable" is the badge's name everywhere in the app. */
export const NOTABLE = 'Notable';

export type NotableLocation = 'never' | 'after' | 'live';
export type NotableMessages = 'picked' | 'insiders';
export type NotableReplies = 'picked' | 'insiders' | 'everyone';
export type MyNotable = {
  notable: boolean;
  /** Passed the selfie check (or an ID check). */
  verified: boolean;
  code: string;
  request: { status: 'open' | 'approved' | 'declined'; created_at: string; official_url: string } | null;
  location: NotableLocation;
  messages: NotableMessages;
  replies: NotableReplies;
  arrivals: boolean;
  intro_requests: boolean;
  show_vouch_count: boolean;
  picks: { id: string; display_name: string; avatar_url: string | null }[];
};
export type NotableMember = { id: string; display_name: string; avatar_url: string | null; headline: string | null; note: string | null };

const unwrap = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export const fetchMyNotable = async () => unwrap<MyNotable>(await supabase.rpc('my_notable'));
export const fetchNotable = async () => unwrap<NotableMember[]>(await supabase.rpc('notable_members'));
export const requestNotable = async (officialUrl: string, manager: string) =>
  unwrap<null>(await supabase.rpc('request_notable', { p_official_url: officialUrl, p_manager: manager || undefined }));
/** Saves all six settings together. */
export const saveNotableSettings = async (s: Pick<MyNotable, 'location' | 'messages' | 'replies' | 'arrivals' | 'intro_requests' | 'show_vouch_count'>) =>
  unwrap<null>(
    await supabase.rpc('set_notable_settings', {
      p_location: s.location,
      p_messages: s.messages,
      p_replies: s.replies,
      p_arrivals: s.arrivals,
      p_intro_requests: s.intro_requests,
      p_show_vouch_count: s.show_vouch_count,
    }),
  );
export const setNotablePick = async (member: string, on: boolean) => unwrap<null>(await supabase.rpc('set_notable_pick', { p_member: member, p_on: on }));
