import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { AppText, Button, LegalNote } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Status = { banned: boolean; suspended_until: string | null };

/** Checks whether this account is suspended or removed. Null while checking. */
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

/** Shown instead of the app when an account is suspended or removed. Never says who reported them. */
export function AccountBlocked({ status }: { status: Status }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const until = status.suspended_until ? new Date(status.suspended_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space[8], paddingBottom: insets.bottom + t.space[6], paddingHorizontal: t.space[5], gap: t.space[4] }}>
      <Logo size={30} />
      <View style={{ flex: 1, justifyContent: 'center', gap: t.space[3] }}>
        <AppText variant="h1" accessibilityRole="header">
          {status.banned ? 'Your account was removed' : 'Your account is suspended'}
        </AppText>
        <AppText tone="muted">
          {status.banned
            ? 'You were removed from I’m In for breaking our Community Guidelines.'
            : `You broke our Community Guidelines, so you can’t use I’m In until ${until}.`}
        </AppText>
        <LegalNote doc="guidelines" align="left">
          Read the
        </LegalNote>
      </View>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </View>
  );
}
