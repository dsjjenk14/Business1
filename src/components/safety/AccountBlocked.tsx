import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { AppText, Button, LegalNote, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export type AccountStatus = { banned: boolean; under_review?: boolean; suspended_until: string | null; appeal_open?: boolean };
type Status = AccountStatus;

/** Checks whether this account is on hold, suspended or removed. Null while checking. */
export function useAccountStatus(enabled: boolean) {
  const [status, setStatus] = useState<Status | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let live = true;
      supabase.rpc('my_account_status').then(({ data }) => {
        if (live && data) setStatus(data as unknown as Status);
      });
      return () => {
        live = false;
      };
    }, [enabled]),
  );
  return status;
}

export function isBlocked(s: Status | null) {
  return !!s && (s.banned || !!s.under_review || !!s.suspended_until);
}

/** Shown instead of the app when an account is on hold, suspended or removed. Never says who reported them. */
export function AccountBlocked({ status }: { status: Status }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(!!status.appeal_open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendAppeal() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('submit_appeal', { p_message: message.trim() });
    setBusy(false);
    if (e) setError(friendlyError(e));
    else setSent(true);
  }

  const until = status.suspended_until ? new Date(status.suspended_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space[8], paddingBottom: insets.bottom + t.space[6], paddingHorizontal: t.space[5], gap: t.space[4] }}>
      <Logo size={30} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: t.space[3] }} keyboardShouldPersistTaps="handled">
        <AppText variant="h1" accessibilityRole="header">
          {status.banned ? 'Your account was removed' : status.suspended_until ? 'Your account is suspended' : 'Your account is on hold'}
        </AppText>
        <AppText tone="muted">
          {status.banned
            ? 'You were removed from I’m In for breaking our Community Guidelines.'
            : status.suspended_until
              ? `You broke our Community Guidelines, so you can’t use I’m In until ${until}.`
              : 'We’re reviewing something about your account. You can’t use I’m In until we finish, usually within a few days. This isn’t a final decision.'}
        </AppText>
        <LegalNote doc="guidelines" align="left">
          Read the
        </LegalNote>
        {sent ? (
          <AppText tone="muted" accessibilityLiveRegion="polite">
            We have your request for a second look. We’ll take a second look and let you know.
          </AppText>
        ) : asking ? (
          <View style={{ gap: t.space[2] }}>
            <TextField
              label="Tell us what you’d like us to know"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
            />
            {error ? (
              <AppText tone="danger" accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}
            <Button label="Send" onPress={sendAppeal} loading={busy} disabled={!message.trim()} />
          </View>
        ) : (
          <Button label="Ask for a second look" variant="secondary" onPress={() => setAsking(true)} />
        )}
      </ScrollView>
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </KeyboardAvoidingView>
  );
}
