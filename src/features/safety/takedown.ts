import { supabase } from '@/lib/supabase';

export type TakedownKind = 'post' | 'out' | 'profile_photo' | 'other';

/** Ask us to remove an intimate image shared without consent. Works signed in or out. Returns the confirmation number. */
export async function submitTakedown(i: {
  kind: TakedownKind;
  statement: string;
  signature: string;
  contact: string;
  confirm: boolean;
  location?: string;
  forSelf: boolean;
  pinId?: number;
  outId?: number;
  posterId?: string;
}) {
  const { data, error } = await supabase.rpc('submit_takedown', {
    p_kind: i.kind,
    p_statement: i.statement,
    p_signature: i.signature,
    p_contact: i.contact,
    p_confirm: i.confirm,
    p_location: i.location || undefined,
    p_for_self: i.forSelf,
    p_pin: i.pinId,
    p_out: i.outId,
    p_poster: i.posterId,
  });
  if (error) throw error;
  return data as string;
}

export type TakedownStatus = { status: 'open' | 'removed' | 'not_removed'; created_at: string; due_at: string; decided_at: string | null };
export async function takedownStatus(code: string) {
  const { data, error } = await supabase.rpc('takedown_status', { p_code: code });
  if (error) throw error;
  return data as unknown as TakedownStatus | null;
}
