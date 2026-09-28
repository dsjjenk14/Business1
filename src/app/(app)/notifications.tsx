import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AIMark, AppText, Card, EmptyState, LoadingList, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';
import type { Tables } from '@/types/database';

export default function Notifications() {
  const t = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<Tables<'notifications'>[] | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems(data ?? []);
        // Opening the list marks everything as read.
        const unread = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
        if (unread.length) supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread).then(() => {});
      });
  }, [session]);

  return (
    <>
      <BackHeader title="Notifications" />
      <Screen contentGap={t.space[3]}>
        {items === null ? (
          <LoadingList rows={4} />
        ) : items.length === 0 ? (
          <EmptyState glyph="spark" title="Nothing yet" body="When people reply, vouch, or head out, you’ll see it here." />
        ) : (
          items.map((n) => (
            <Card key={n.id} accent={n.is_ai ? 'ai' : !n.read_at ? 'primary' : undefined} onPress={n.link ? () => router.push(n.link as Href) : undefined} accessibilityLabel={`${n.title}. ${n.body}`}>
              <View style={{ gap: t.space[1] }}>
                {n.is_ai ? <AIMark /> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                  <AppText weight="bold" style={{ flex: 1 }}>
                    {n.title}
                  </AppText>
                  <AppText variant="caption" tone="subtle">
                    {timeAgo(n.created_at)}
                  </AppText>
                </View>
                {n.body ? (
                  <AppText variant="small" tone="muted">
                    {n.body}
                  </AppText>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </Screen>
    </>
  );
}
