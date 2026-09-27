import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTile, GlyphTitle, IconButton, Screen, Section, TextField, useToast } from '@/components/ui';
import { checkInSafe, fetchDateMode, type DateModeStatus } from '@/features/dates/api';
import { addTrustedContact, fetchTrustedContacts, removeTrustedContact, type TrustedContact } from '@/features/safety/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const pretty = (e164: string) => (e164.startsWith('+1') && e164.length === 12 ? `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}` : e164);

/** Safety & Check In: I'm safe, trusted contacts, and one-tap help. */
export default function Safety() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [contacts, setContacts] = useState<TrustedContact[] | null>(null);
  const [dateMode, setDateMode] = useState<DateModeStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([fetchTrustedContacts(), fetchDateMode().catch(() => null)]);
    setContacts(c);
    setDateMode(d);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setContacts([]));
    }, [load]),
  );

  async function add() {
    if (!me) return;
    setBusy(true);
    try {
      await addTrustedContact(me, name, phone);
      setName('');
      setPhone('');
      setAdding(false);
      toast(`${name.trim()} added`);
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Safety" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <GlyphTile name="shield" size={64} tone="trust" />
          <AppText variant="h2" align="center" accessibilityRole="header">
            Safety & Check In
          </AppText>
          <AppText tone="muted" align="center">
            On a date, turn on Date Mode: check in on a timer, and your trusted contacts are on standby.
          </AppText>
        </View>

        {dateMode?.status === 'active' ? (
          <Button label="I'm safe: check in" variant="trust" onPress={() => checkInSafe().then(() => toast('Checked in')).catch((e) => toast(friendlyError(e)))} />
        ) : (
          <Button label="Start Date Mode" variant="trust" onPress={() => router.push('/date-mode')} />
        )}

        <Section title="Trusted contacts">
          <AppText variant="small" tone="muted">
            If you need help, you can text them your location in one tap. They don&apos;t need the app.
          </AppText>
          {(contacts ?? []).map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 48 }}>
              <GlyphTile name="phone" size={36} tone="muted" />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{c.name}</AppText>
                <AppText variant="caption" tone="muted">
                  {pretty(c.phone)}
                </AppText>
              </View>
              <IconButton
                icon="trash-outline"
                label={`Remove ${c.name}`}
                onPress={() =>
                  removeTrustedContact(c.id)
                    .then(load)
                    .catch((e) => toast(friendlyError(e)))
                }
              />
            </View>
          ))}
          {adding ? (
            <Card>
              <View style={{ gap: t.space[3] }}>
                <TextField label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="Mom" />
                <TextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(202) 555-0102" />
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Button label="Save" size="md" style={{ flex: 1 }} onPress={add} loading={busy} disabled={!name.trim() || !phone.trim()} />
                  <Button label="Cancel" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding(false)} />
                </View>
              </View>
            </Card>
          ) : (contacts?.length ?? 0) < 5 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdding(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 48 }}>
              <GlyphTile name="plus" size={36} />
              <AppText weight="bold" tone="primary">
                Add a trusted contact
              </AppText>
            </Pressable>
          ) : null}
        </Section>

        <Section title="If you need help">
          <Card onPress={() => router.push('/safety/help')} accessibilityLabel="I need help right now">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <GlyphTile name="siren" size={44} tone="primary" />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" tone="danger">
                  I need help right now
                </AppText>
                <AppText variant="small" tone="muted">
                  Alert contacts · share location · 911
                </AppText>
              </View>
            </View>
          </Card>
          <GlyphTitle glyph="warning" tone="muted" variant="small">
            To report someone, open their profile or a message and tap Report.
          </GlyphTitle>
        </Section>
      </Screen>
    </KeyboardAvoidingView>
  );
}
