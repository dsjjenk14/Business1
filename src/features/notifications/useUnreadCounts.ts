import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { loadSoundSetting, playSound } from '@/features/sounds/sounds';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import { PUSH_SUPPORTED } from './push';

/**
 * Unread notification and message counts for the header badges. Refreshes
 * when the screen comes into view, when the app comes back to the front, and
 * when a push arrives; also keeps the app icon badge in step.
 */
export function useUnreadCounts() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useFocusEffect(refresh);

  useEffect(() => {
    const app = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const push = PUSH_SUPPORTED
      ? Notifications.addNotificationReceivedListener(() => {
          refresh();
          playSound('in');
        })
      : null;
    return () => {
      app.remove();
      push?.remove();
    };
  }, [refresh]);

  // Live: a new notification while the app is open (also works without push,
  // e.g. on the web). Chimes once, even if a push arrives for the same thing.
  useEffect(() => {
    if (!userId) return;
    loadSoundSetting(userId).catch(() => undefined);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let closed = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (closed) return;
      channel = supabase
        .channel(`notifications:${userId}:${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
          refresh();
          playSound('in');
        })
        .subscribe();
    })();
    return () => {
      closed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

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
      if (cancelled) return;
      setCounts({ notifications: notifications ?? 0, messages });
      if (PUSH_SUPPORTED) Notifications.setBadgeCountAsync((notifications ?? 0) + messages).catch(() => undefined);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  return counts;
}
