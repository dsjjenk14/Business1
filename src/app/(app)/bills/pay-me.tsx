import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, LoadingList, Screen, TextField, useToast } from '@/components/ui';
import { fetchMyPayTo, saveMyPayTo } from '@/features/bills/api';
import { goBackOr } from '@/lib/navigation';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Your Venmo, Cash App and PayPal usernames, shown only to friends who owe you. */
export default function PayMe() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<{ venmo: string; cashapp: string; paypal: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMyPayTo()
      .then((p) => setForm({ venmo: p.venmo ?? '', cashapp: p.cashapp ?? '', paypal: p.paypal ?? '' }))
      .catch(() => setForm({ venmo: '', cashapp: '', paypal: '' }));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await saveMyPayTo(form);
      toast('Saved');
      goBackOr(router, '/bills');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Where friends pay you" />
      <Screen>
        <AppText tone="muted">
          When you split a bill, friends who owe you get a button that opens the app with the amount filled in. Only people who owe you see these.
        </AppText>
        {!form ? (
          <LoadingList rows={3} />
        ) : (
          <View style={{ gap: t.space[4] }}>
            <TextField label="Venmo username" optional value={form.venmo} onChangeText={(v) => setForm({ ...form, venmo: v })} autoCapitalize="none" autoCorrect={false} placeholder="@yourname" />
            <TextField label="Cash App $cashtag" optional value={form.cashapp} onChangeText={(v) => setForm({ ...form, cashapp: v })} autoCapitalize="none" autoCorrect={false} placeholder="$yourname" />
            <TextField label="PayPal.me name" optional value={form.paypal} onChangeText={(v) => setForm({ ...form, paypal: v })} autoCapitalize="none" autoCorrect={false} placeholder="yourname" />
            <Button label="Save" onPress={save} loading={busy} />
          </View>
        )}
        <AppText variant="caption" tone="subtle">
          I&apos;m In never touches the money and takes no fee. Payments happen in those apps, under their terms.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
