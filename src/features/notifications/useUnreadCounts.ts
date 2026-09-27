import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Unread notification and message counts for the header badges. */
export function useUnreadCounts() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      const [{ count: notifications }, { data: memberships }] = await Promise.all([
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId!).is('read_at', null),
        supabase.from('conversation_members').select('conversation_id, last_read_at, conversations(last_message_at)').eq('user_id', userId!),
      ]);
      const messages = (memberships ?? []).filter((m) => {
        const last = m.conversations?.last_message_at;
        return last && (!m.last_read_at || last > m.last_read_at);
      }).length;
      if (!cancelled) setCounts({ notifications: notifications ?? 0, messages });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return counts;
}
