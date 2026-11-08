import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, TextField, useToast } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import type { Database } from '@/types/database';

type Reviewer = Database['public']['Functions']['admin_photo_reviewers']['Returns'][number];

/** Admins: add or remove photo reviewers, trusted helpers who can approve photo checks and see nothing else. */
export function PhotoReviewers() {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Reviewer[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    supabase.rpc('admin_photo_reviewers').then(({ data }) => setRows((data as Reviewer[] | null) ?? []));
  }, []);
  useFocusEffect(load);

  async function set(addr: string, on: boolean) {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_photo_reviewer', { p_email: addr, p_on: on });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    toast(on ? `${data} can review photos now` : `${data} is no longer a reviewer`);
    if (on) setEmail('');
    load();
  }

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <AppText weight="bold" accessibilityRole="header">
          Photo reviewers
        </AppText>
        <AppText variant="small" tone="muted">
          Trusted helpers who approve photo checks. They see the selfie and profile photos, and nothing else in Admin.
        </AppText>
        {rows.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
            <View style={{ flex: 1 }}>
              <AppText weight="bold">{r.display_name}</AppText>
              <AppText variant="caption" tone="subtle">
                {r.email} · {r.reviewed} reviewed
              </AppText>
            </View>
            <Button label="Remove" size="md" variant="ghost" onPress={() => set(r.email, false)} disabled={busy} />
          </View>
        ))}
        <TextField label="Add a reviewer by email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Button label="Add reviewer" size="md" variant="secondary" onPress={() => set(email, true)} disabled={busy || !email.includes('@')} />
      </View>
    </Card>
  );
}
