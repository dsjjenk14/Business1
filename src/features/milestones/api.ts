import { supabase } from '@/lib/supabase';

/** Vouch milestones. Each is a bigger moment than the last; 1000 makes you famous on I'm In. */
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
