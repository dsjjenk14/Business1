import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { signInWithEmailOrPhone } from '@/features/auth/signIn';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email or phone and your password.');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailOrPhone(identifier, password);
      // The root navigator switches to the app automatically once the session exists.
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen safeTop contentGap={t.space[5]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <AppText tone="muted">← Back</AppText>
        </Pressable>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="h1" accessibilityRole="header">
            Welcome back
          </AppText>
          <AppText tone="muted">Sign in to your I&apos;m In account.</AppText>
        </View>
        <TextField
          label="Email or phone"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          keyboardType="email-address"
          placeholder="you@email.com or (202) 555-0100"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
        {error ? (
          <AppText tone="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Log In" onPress={onSubmit} loading={busy} />
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')} style={{ alignSelf: 'center' }} hitSlop={10}>
          <AppText tone="primary" weight="bold">
            Forgot password?
          </AppText>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
          <AppText variant="small" tone="subtle">
            or
          </AppText>
          <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
        </View>
        <Button label="Create an Account" variant="secondary" onPress={() => router.replace('/signup')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
