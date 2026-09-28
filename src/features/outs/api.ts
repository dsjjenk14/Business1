import { readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';

export type OutsInbox = {
  received: { sender_id: string; name: string; avatar_url: string | null; unopened: number; latest_at: string; next_out_id: number | null }[];
  stories: { sender_id: string; name: string; avatar_url: string | null; out_ids: number[]; latest_at: string; all_seen: boolean }[];
  my_story: { id: number; created_at: string; caption: string | null; views: number; screenshots: number }[];
  sent: { id: number; created_at: string; to: string; recipients: number; opened: number; screenshots: number }[];
};
export type OpenedOut = { url: string; caption: string | null; sender_name: string; sender_id: string; created_at: string; event_title: string | null };
export type OutEvent = { id: number; title: string; place: string | null };

export async function fetchOutsInbox() {
  const { data, error } = await supabase.rpc('outs_inbox');
  if (error) throw error;
  return data as unknown as OutsInbox;
}

/** Upload the photo, then send it to friends and/or post it to My Out. */
export async function sendOut(input: { userId: string; uri: string; caption: string; to: string[]; toStory: boolean }) {
  const { bytes, contentType } = await readBytes(input.uri);
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const up = await supabase.storage.from('outs').upload(path, bytes, { contentType });
  if (up.error) throw up.error;
  const { data, error } = await supabase.rpc('send_out', {
    p_path: path,
    p_caption: input.caption.trim(),
    p_recipients: input.to,
    p_to_story: input.toStory,
  });
  if (error) throw error;
  return data as number;
}

/** Open an Out. A direct Out can only be opened once. */
export async function openOut(outId: number): Promise<OpenedOut> {
  const { data, error } = await supabase.functions.invoke('open-out', { body: { out_id: outId } });
  if (error) {
    let message = 'Outs aren’t available right now.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return data as OpenedOut;
}

export async function reportScreenshot(outId: number) {
  await supabase.rpc('out_screenshot', { p_out: outId });
}

/** The I'm In event you're at right now (Outs can only be posted from one), or null. */
export async function fetchOutEvent() {
  const { data, error } = await supabase.rpc('my_out_event');
  if (error) throw error;
  return (data ?? null) as OutEvent | null;
}
