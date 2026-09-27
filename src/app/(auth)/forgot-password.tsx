import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function ForgotPassword() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setBusy(false);
    // Same message whether or not the email exists, so accounts can't be discovered.
    if (e && /rate limit/i.test(e.message)) setError(friendlyError(e));
    else setSent(true);
  }

  return (
    <Screen safeTop contentGap={t.space[5]}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
        <AppText tone="muted">← Back</AppText>
      </Pressable>
      <View style={{ gap: t.space[2] }}>
        <AppText variant="h1" accessibilityRole="header">
          {sent ? 'Check your email' : 'Forgot password?'}
        </AppText>
        <AppText tone="muted">
          {sent
            ? `If an account exists for ${email.trim()}, a reset link is on its way. It expires in 1 hour.`
            : "Enter your email and we'll send you a link to set a new password."}
        </AppText>
      </View>
      {sent ? (
        <Button label="Back to Log In" onPress={() => router.replace('/login')} />
      ) : (
        <>
          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            error={error}
            returnKeyType="send"
            onSubmitEditing={onSubmit}
          />
          <Button label="Send reset link" onPress={onSubmit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
