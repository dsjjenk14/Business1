import { useRouter } from 'expo-router';
import { useState } from 'react';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Opened from the password-reset email link (the link signs you in for this one step). */
export default function ResetPassword() {
  const t = useTheme();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) setError(friendlyError(e));
    else setDone(true);
  }

  return (
    <>
      <BackHeader title="New password" />
      <Screen contentGap={t.space[5]}>
        {done ? (
          <>
            <AppText variant="h2">Password updated ✓</AppText>
            <Button label="Continue" onPress={() => router.replace('/')} />
          </>
        ) : (
          <>
            <AppText tone="muted">Choose a new password for your account.</AppText>
            <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={error} />
            <Button label="Save password" onPress={onSubmit} loading={busy} />
          </>
        )}
      </Screen>
    </>
  );
}
