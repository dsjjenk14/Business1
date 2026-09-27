import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AIMark, AppText, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';
import type { Tables } from '@/types/database';

export default function Notifications() {
  const t = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<Tables<'notifications'>[] | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setItems(data ?? []));
  }, [session]);

  return (
    <>
      <BackHeader title="Notifications" />
      <Screen contentGap={t.space[3]}>
        {items === null ? null : items.length === 0 ? (
          <AppText tone="muted" align="center">
            Nothing yet. When people reply, vouch, or head out, you&apos;ll see it here.
          </AppText>
        ) : (
          items.map((n) => (
            <Card key={n.id} accent={n.is_ai ? 'ai' : undefined}>
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
