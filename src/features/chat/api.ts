import type { PersonLite } from '@/features/circles/api';
import { supabase } from '@/lib/supabase';

export type ChatMessage = { id: number; sender_id: string; body: string; created_at: string };
export type ConversationInfo = { id: number; kind: 'direct' | 'group'; group_id: number | null; title: string; emoji: string | null; members: PersonLite[] };

export async function fetchConversation(id: number) {
  const { data, error } = await supabase.rpc('conversation_info', { p_conv: id });
  if (error) throw error;
  return data as unknown as ConversationInfo | null;
}

export async function fetchMessages(conversationId: number, before?: string) {
  let q = supabase.from('messages').select('id, sender_id, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
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

/** New messages in a conversation, live. Returns an unsubscribe function. */
export function subscribeToMessages(conversationId: number, onMessage: (m: ChatMessage) => void) {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const m = payload.new as ChatMessage;
      onMessage({ id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
