import type { PersonLite } from '@/features/circles/api';
import { supabase } from '@/lib/supabase';

export type ChatMessage = { id: number; sender_id: string; body: string; created_at: string };
export type ConversationInfo = { id: number; kind: 'direct' | 'group'; group_id: number | null; title: string; emoji: string | null; members: PersonLite[] };

export async function fetchConversation(id: number) {
  const { data, error } = await supabase.rpc('conversation_info', { p_conv: id });
  if (error) throw error;
  return data as unknown as ConversationInfo | null;
}

export async function fetchMessages(conversationId: number, before?: string, after?: string) {
  let q = supabase.from('messages').select('id, sender_id, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  if (after) q = q.gt('created_at', after);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function sendMessage(conversationId: number, senderId: string, body: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select('id, sender_id, body, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function markRead(conversationId: number, userId: string) {
  await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', userId);
}

/**
 * New messages in a conversation, live. Calls onConnected each time the live
 * connection is (re)established, so the screen can catch up on anything missed.
 * If the connection fails it retries. Returns an unsubscribe function.
 */
export function subscribeToMessages(conversationId: number, onMessage: (m: ChatMessage) => void, onConnected?: () => void) {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = async () => {
    // Make sure the live connection carries the member's login (after an app
    // restart it can otherwise start before the session is restored, and the
    // server would then filter out every message).
    await supabase.realtime.setAuth();
    if (closed) return;
    channel = supabase
      .channel(`conversation:${conversationId}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        onMessage({ id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at });
      })
      .subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') onConnected?.();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const old = channel;
          channel = null;
          if (old) supabase.removeChannel(old);
          retry = setTimeout(() => void connect(), 2000);
        }
      });
  };
  void connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (channel) supabase.removeChannel(channel);
  };
}

export type MessageStatus = {
  can_message: boolean;
  blocked: boolean;
  degree: number | null;
  via_intro: boolean;
  exchanges: number;
  needed: number;
  conversation_id: number | null;
};

export async function fetchMessageStatus(other: string) {
  const { data, error } = await supabase.rpc('message_status', { p_other: other });
  if (error) throw error;
  return data as unknown as MessageStatus;
}

/** Opens (or creates) the 1:1 chat with someone you can message. */
export async function openDirectChat(other: string) {
  const { data, error } = await supabase.rpc('open_direct_conversation', { p_other: other });
  if (error) throw error;
  return data as number;
}
