import { useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { deleteMyAccount } from '@/features/safety/api';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Permanently deletes the account (App Store requirement). */
export default function DeleteAccount() {
  const t = useTheme();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      // The login no longer exists on the server, so only clear it on this device.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <BackHeader title="Delete account" />
      <Screen>
        <Card accent="primary">
          <View style={{ gap: t.space[2] }}>
            <AppText variant="h3">This can&apos;t be undone</AppText>
            <AppText variant="small" tone="muted">
              Deleting your account permanently removes your profile, photos, pins, replies, vouches (given and received), connections,
              intros and messages. Groups you own are handed to another member.
            </AppText>
            <AppText variant="small" tone="muted">
              If you have Premium, cancel it in your App Store settings too, so you aren&apos;t billed again.
            </AppText>
          </View>
        </Card>
        <TextField
          label="Type DELETE to confirm"
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error}
        />
        <Button label="Delete my account" variant="danger" onPress={remove} loading={busy} disabled={confirm.trim() !== 'DELETE'} />
      </Screen>
    </>
  );
}
