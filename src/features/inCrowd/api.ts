import { supabase } from '@/lib/supabase';

/** The In Crowd: verified public figures. "In Crowd" is the badge's name everywhere in the app. */
export const IN_CROWD = 'In Crowd';

export type InCrowdLocation = 'never' | 'after' | 'live';
export type InCrowdMessages = 'picked' | 'insiders';
export type InCrowdReplies = 'picked' | 'insiders' | 'everyone';
export type MyInCrowd = {
  in_crowd: boolean;
  /** Passed the selfie check (or an ID check). */
  verified: boolean;
  code: string;
  request: { status: 'open' | 'approved' | 'declined'; created_at: string; official_url: string } | null;
  location: InCrowdLocation;
  messages: InCrowdMessages;
  replies: InCrowdReplies;
  arrivals: boolean;
  intro_requests: boolean;
  show_vouch_count: boolean;
  picks: { id: string; display_name: string; avatar_url: string | null }[];
};
export type InCrowdMember = { id: string; display_name: string; avatar_url: string | null; headline: string | null; note: string | null };

const unwrap = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export const fetchMyInCrowd = async () => unwrap<MyInCrowd>(await supabase.rpc('my_in_crowd'));
export const fetchInCrowd = async () => unwrap<InCrowdMember[]>(await supabase.rpc('in_crowd_members'));
export const requestInCrowd = async (officialUrl: string, manager: string) =>
  unwrap<null>(await supabase.rpc('request_in_crowd', { p_official_url: officialUrl, p_manager: manager || undefined }));
/** Saves all six settings together. */
export const saveInCrowdSettings = async (s: Pick<MyInCrowd, 'location' | 'messages' | 'replies' | 'arrivals' | 'intro_requests' | 'show_vouch_count'>) =>
  unwrap<null>(
    await supabase.rpc('set_in_crowd_settings', {
      p_location: s.location,
      p_messages: s.messages,
      p_replies: s.replies,
      p_arrivals: s.arrivals,
      p_intro_requests: s.intro_requests,
      p_show_vouch_count: s.show_vouch_count,
    }),
  );
export const setInCrowdPick = async (member: string, on: boolean) => unwrap<null>(await supabase.rpc('set_in_crowd_pick', { p_member: member, p_on: on }));
