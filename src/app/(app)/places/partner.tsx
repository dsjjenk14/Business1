import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, GlyphTile, Screen, TextField, useToast } from '@/components/ui';
import { submitPartnerInquiry } from '@/features/places/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** "Become a Partner": venues ask to be featured with a member perk. */
export default function Partner() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [business, setBusiness] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await submitPartnerInquiry({ business, contact, email, phone, address, message });
      setSent(true);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Become a Partner" />
      <Screen contentGap={t.space[4]}>
        {sent ? (
          <View style={{ alignItems: 'center', gap: t.space[3] }}>
            <GlyphTile name="mail" size={64} tone="sponsored" />
            <AppText variant="h2" align="center">
              Thanks!
            </AppText>
            <AppText tone="muted" align="center">
              We&apos;ll reach out to {email.trim()} within a few days.
            </AppText>
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <AppText tone="muted">
              Featured partners offer a perk to I&apos;m In members (a discount, priority entry, a welcome drink) and appear, clearly labeled, on
              Featured Places and in members&apos; feeds.
            </AppText>
            <TextField label="Business name" value={business} onChangeText={setBusiness} maxLength={120} />
            <TextField label="Your name" value={contact} onChangeText={setContact} maxLength={80} />
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
            <TextField label="Phone" optional value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
            <TextField label="Address" optional value={address} onChangeText={setAddress} maxLength={200} />
            <TextField label="Anything else" optional value={message} onChangeText={setMessage} maxLength={2000} multiline placeholder="The perk you have in mind, best times to reach you…" />
            <Button
              label="Send"
              onPress={submit}
              loading={busy}
              disabled={business.trim().length < 2 || contact.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
