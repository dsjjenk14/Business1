import { supabase } from '@/lib/supabase';

/** Vouch milestones. Each is a bigger moment than the last; 1000 is the biggest. */
export const MILESTONES = [10, 30, 75, 100, 300, 500, 1000] as const;
export const FAMOUS_AT = 1000;

export function milestoneFor(count: number | null | undefined): number {
  return [...MILESTONES].reverse().find((m) => (count ?? 0) >= m) ?? 0;
}

export async function fetchPendingMilestone(): Promise<number> {
  const { data, error } = await supabase.rpc('my_pending_milestone');
  if (error) throw error;
  return (data as number | null) ?? 0;
}

export async function celebrateMilestone(m: number) {
  const { error } = await supabase.rpc('celebrate_milestone', { p_milestone: m });
  if (error) throw error;
}

export type FamousMember = { id: string; display_name: string; avatar_url: string | null; vouch_count: number };
export async function fetchFamous(): Promise<FamousMember[]> {
  const { data, error } = await supabase.rpc('famous_members');
  if (error) throw error;
  return (data ?? []) as FamousMember[];
}

/** At 1,000 vouches: yes or no to a shoutout from the official I'm In account. */
export async function answerShoutout(yes: boolean): Promise<'posted' | 'waiting' | 'declined'> {
  const { data, error } = await supabase.rpc('answer_shoutout', { p_yes: yes });
  if (error) throw error;
  return data as 'posted' | 'waiting' | 'declined';
}
