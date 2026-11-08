import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Chip, EmptyState, GlyphTitle, Screen, useCelebrate, useToast } from '@/components/ui';
import { fetchVouchWords, vouchFromContacts } from '@/features/circles/api';
import { findContactsOnApp, sendInsiderRequest, type ContactOnApp } from '@/features/connect/contactsOnApp';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Friends already on I'm In, from your phone's contacts. Add them as Insiders
 * (they accept), or vouch for them. There's no way to ask them for a vouch.
 */
export default function ContactsOnApp() {
  const t = useTheme();
  const toast = useToast();
  const [celebration, celebrate] = useCelebrate();
  const [people, setPeople] = useState<ContactOnApp[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<{ id: number; word: string }[]>([]);
  const [vouching, setVouching] = useState<string | null>(null);
  const [vouched, setVouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVouchWords()
      .then(setWords)
      .catch(() => undefined);
  }, []);

  async function check() {
    setBusy(true);
    try {
      setPeople(await findContactsOnApp());
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(p: ContactOnApp) {
    try {
      await sendInsiderRequest(p.id);
      setPeople((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, request_sent: true } : x)));
      toast(`Request sent to ${p.display_name}`);
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function vouch(p: ContactOnApp, wordId: number) {
    try {
      if (await vouchFromContacts(p.id, wordId, [p.phone])) {
        setVouched((s) => new Set(s).add(p.id));
        celebrate('Vouched', `for ${p.display_name}`);
      } else toast('That number didn’t match. Try again from their profile.');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setVouching(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Friends already here" />
      <Screen>
        {Platform.OS === 'web' ? (
          <EmptyState glyph="phone" title="Open I’m In on your phone" body="Finding friends from your contacts works in the phone app." />
        ) : people === null ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <GlyphTitle glyph="people">See who you know</GlyphTitle>
              <AppText variant="small" tone="muted">
                We check your contacts against members&apos; verified numbers. Your phone sends scrambled fingerprints of the numbers, not the
                numbers themselves, and we don&apos;t keep them. Nobody is told you looked.
              </AppText>
              <Button label="Check my contacts" onPress={check} loading={busy} />
            </View>
          </Card>
        ) : people.length === 0 ? (
          <EmptyState glyph="people" title="No one yet" body="None of your contacts are on I’m In yet. Invite a few from your Insiders tab." />
        ) : (
          people.map((p) => (
            <Card key={p.id}>
              <View style={{ gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <Avatar name={p.display_name} uri={p.avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{p.display_name}</AppText>
                    <AppText variant="caption" tone="subtle">
                      {p.vouch_count} {p.vouch_count === 1 ? 'vouch' : 'vouches'}
                      {p.is_insider ? ' · Your Insider' : ''}
                    </AppText>
                  </View>
                </View>
                {vouching === p.id ? (
                  <View style={{ gap: t.space[2] }}>
                    <AppText variant="small" weight="bold">
                      One word for {p.display_name.split(' ')[0]}
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                      {words.map((w) => (
                        <Chip key={w.id} label={w.word} onPress={() => vouch(p, w.id)} />
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    {!p.is_insider ? (
                      <Button
                        label={p.request_sent ? 'Request sent' : 'Add as Insider'}
                        size="md"
                        style={{ flex: 1 }}
                        disabled={p.request_sent}
                        onPress={() => add(p)}
                      />
                    ) : null}
                    <Button
                      label={vouched.has(p.id) ? 'Vouched' : 'Vouch'}
                      size="md"
                      variant="trust"
                      style={{ flex: 1 }}
                      disabled={vouched.has(p.id)}
                      onPress={() => setVouching(p.id)}
                    />
                  </View>
                )}
              </View>
            </Card>
          ))
        )}
      </Screen>
      {celebration}
    </View>
  );
}
