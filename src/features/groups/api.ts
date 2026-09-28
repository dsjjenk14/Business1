import type { PersonLite } from '@/features/circles/api';
import { supabase } from '@/lib/supabase';

export const GROUP_CATEGORIES = [
  { key: 'fitness', label: 'Fitness', glyph: 'fitness' },
  { key: 'food', label: 'Food', glyph: 'dinner' },
  { key: 'music_arts', label: 'Music & Arts', glyph: 'music' },
  { key: 'outdoors', label: 'Outdoors', glyph: 'outdoors' },
  { key: 'social', label: 'Social', glyph: 'wine' },
  { key: 'alumni', label: 'Alumni', glyph: 'cap' },
  { key: 'professional', label: 'Professional', glyph: 'briefcase' },
  { key: 'other', label: 'Other', glyph: 'spark' },
] as const;
export type GroupCategory = (typeof GROUP_CATEGORIES)[number]['key'];

export const HOW_FOUND = [
  { key: 'through_member', label: 'Through a member' },
  { key: 'discovery', label: 'Discovery feed' },
  { key: 'search', label: 'Search' },
  { key: 'word_of_mouth', label: 'Someone told me' },
] as const;

export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupDetail = {
  id: number;
  name: string;
  emoji: string;
  category: GroupCategory;
  description: string;
  join_type: 'open' | 'request';
  schedule_label: string | null;
  owner: { id: string; display_name: string };
  member_count: number;
  my_role: GroupRole | null;
  invited: boolean;
  requested: boolean;
  conversation_id: number | null;
  members: (PersonLite & { role: GroupRole; vouch_count: number; in_circle: boolean })[];
  next_event: { id: number; title: string; starts_at: string; venue_name: string | null; going_count: number; i_am_going: boolean } | null;
  pending_requests: { id: number; why: string; how_found: string | null; created_at: string; user: PersonLite & { vouch_count: number } }[];
};

export async function fetchGroup(id: number) {
  const { data, error } = await supabase.rpc('group_detail', { p_group: id });
  if (error) throw error;
  return data as unknown as GroupDetail | null;
}

export async function createGroup(input: {
  name: string;
  category: GroupCategory;
  description: string;
  joinType: 'open' | 'request';
  glyph?: string;
  schedule?: string;
  invite: string[];
}) {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name.trim(),
    p_category: input.category,
    p_description: input.description.trim(),
    p_join_type: input.joinType,
    p_emoji: input.glyph || undefined,
    p_schedule: input.schedule?.trim() || undefined,
    p_invite: input.invite,
  });
  if (error) throw error;
  return data as number;
}

export async function joinGroup(id: number) {
  const { data, error } = await supabase.rpc('join_group', { p_group: id });
  if (error) throw error;
  return data as string;
}

export async function requestToJoin(id: number, why: string, how: string | null) {
  const { error } = await supabase.rpc('request_join_group', { p_group: id, p_why: why.trim(), p_how: how ?? undefined });
  if (error) throw error;
}

export async function reviewRequest(requestId: number, approve: boolean) {
  const { error } = await supabase.rpc('review_join_request', { p_request: requestId, p_approve: approve });
  if (error) throw error;
}

export async function leaveGroup(id: number) {
  const { error } = await supabase.rpc('leave_group', { p_group: id });
  if (error) throw error;
}
