import { useFeature } from '@/config/useAppConfig';
import { supabase } from '@/lib/supabase';

export type LiveAudience = 'circle' | 'network' | 'everyone';
export type LiveNow = { stream_id: number; host_id: string; host_name: string; avatar_url: string | null; title: string; audience: LiveAudience; started_at: string };
export type LiveComment = { id: number; name: string; body: string; at: string };
export type LiveDetail = {
  id: number;
  host_id: string;
  host_name: string;
  avatar_url: string | null;
  title: string;
  audience: LiveAudience;
  started_at: string;
  is_live: boolean;
  is_host: boolean;
  comments: LiveComment[];
};

export const LIVE_AUDIENCES: { key: LiveAudience; label: string; detail: string }[] = [
  { key: 'circle', label: 'My Insiders', detail: 'Your Insiders. They get a notification.' },
  { key: 'network', label: 'My network', detail: 'Your Insiders and theirs.' },
  { key: 'everyone', label: 'Everyone', detail: 'Anyone on I’m In (except people you’ve blocked).' },
];

/** Live video is off until a video service is connected (app_config.live_video_enabled). */
export function useLiveEnabled() {
  return useFeature('live_video_enabled');
}

export async function startLive(title: string, audience: LiveAudience) {
  const { data, error } = await supabase.rpc('start_live', { p_title: title.trim(), p_audience: audience });
  if (error) throw error;
  return data as number;
}

export async function endLive(streamId: number) {
  const { error } = await supabase.rpc('end_live', { p_stream: streamId });
  if (error) throw error;
}

export async function fetchLiveNow() {
  const { data, error } = await supabase.rpc('live_now');
  if (error) throw error;
  return (data ?? []) as LiveNow[];
}

/** The live video and its comments (only comments newer than `after`, when given). */
export async function fetchLiveDetail(streamId: number, after = 0) {
  const { data, error } = await supabase.rpc('live_detail', { p_stream: streamId, p_after: after });
  if (error) throw error;
  return data as unknown as LiveDetail | null;
}

export async function postLiveComment(streamId: number, body: string) {
  const { error } = await supabase.rpc('post_live_comment', { p_stream: streamId, p_body: body.trim() });
  if (error) throw error;
}

/** A pass to watch (or, for the host, to broadcast). Throws "Live video isn't turned on yet." until set up. */
export async function fetchLiveAccess(streamId: number) {
  const { data, error } = await supabase.functions.invoke('live', { body: { stream_id: streamId } });
  if (error) {
    let message = 'Live video isn’t available right now.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return data as { url: string; token: string; role: 'host' | 'viewer' };
}
