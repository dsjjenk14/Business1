import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText, Button, Card, useToast } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';
import type { Database } from '@/types/database';

type Req = Database['public']['Functions']['admin_notable_requests']['Returns'][number];

/** Notable requests: check the code is in their official account's bio, then approve. */
export function AdminNotable() {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    supabase.rpc('admin_notable_requests').then(({ data }) => setRows((data as Req[] | null) ?? []));
  }, []);
  useFocusEffect(load);

  async function decide(r: Req, approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc('admin_decide_notable', { p_request: r.id, p_approve: approve });
    setBusy(false);
    if (error) toast(friendlyError(error));
    else {
      toast(approve ? `${r.name} is Notable now` : 'Declined');
      load();
    }
  }

  if (!rows.length) return null;
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Notable requests ({rows.length})
      </AppText>
      {rows.map((r) => (
        <Card key={r.id} accent="primary">
          <View style={{ gap: t.space[2] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
              <AppText weight="bold" style={{ flex: 1 }}>
                {r.name}
              </AppText>
              <AppText variant="caption" tone="subtle">
                {timeAgo(r.created_at)}
              </AppText>
            </View>
            <AppText variant="small">
              Look for <AppText variant="small" weight="bold">{r.code}</AppText> in the bio of:
            </AppText>
            <Button label={r.official_url} size="md" variant="ghost" onPress={() => Linking.openURL(r.official_url.startsWith('http') ? r.official_url : `https://${r.official_url}`)} />
            <AppText variant="caption" tone="subtle">
              {r.verified ? 'Selfie check passed' : 'No selfie check yet'}
              {r.manager ? ` · Manager: ${r.manager}` : ''}
            </AppText>
            <AppText variant="caption" tone="subtle">
              Approve only if the code is there and the account is clearly theirs (verified, or well known).
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="Approve" size="md" style={{ flex: 1 }} onPress={() => decide(r, true)} disabled={busy} />
              <Button label="Decline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => decide(r, false)} disabled={busy} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}
