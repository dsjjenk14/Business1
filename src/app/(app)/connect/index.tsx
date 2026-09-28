import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ConnectedCard } from '@/components/connect/ConnectedCard';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTitle, Screen, Section, TextField, useToast } from '@/components/ui';
import { createConnectCode, prettyCode, qrLink, redeemConnectCode, type ConnectCode, type ConnectResult } from '@/features/connect/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const minutesLeft = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));

/**
 * Add someone. Two ways (plus meeting up and intros):
 *  • Together right now: one shows a QR, the other scans it. Counts as meeting in person.
 *  • Know each other outside the app: one gets a code and shares it, the other types it.
 */
export default function Connect() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [qr, setQr] = useState<ConnectCode | null>(null);
  const [shared, setShared] = useState<ConnectCode | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the "works for N more minutes" line fresh, and swap in a new QR when it runs out.
  useEffect(() => {
    timer.current = setInterval(() => {
      setTick((n) => n + 1);
      setQr((q) => (q && minutesLeft(q.expires_at) <= 0 ? null : q));
    }, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function makeQr() {
    try {
      setQr(await createConnectCode('qr'));
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function makeCode() {
    try {
      setShared(await createConnectCode('code'));
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function shareCode() {
    if (!shared) return;
    const message = `Connect with me on I'm In: open the app, go to Circles → Add someone → Type a code, and enter ${prettyCode(shared.code)}`;
    if (Platform.OS === 'web') {
      await navigator.clipboard?.writeText(prettyCode(shared.code)).catch(() => undefined);
      toast('Code copied');
      return;
    }
    await Share.share({ message }).catch(() => undefined);
  }

  async function connect() {
    setBusy(true);
    try {
      const r = await redeemConnectCode(typed);
      setResult(r);
      setTyped('');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Add someone" />
      <Screen contentGap={t.space[5]}>
        {result ? <ConnectedCard result={result} /> : null}

        <Section title="Together right now?">
          <Card>
            <View style={{ gap: t.space[3] }}>
              <GlyphTitle glyph="people">Scan to connect</GlyphTitle>
              <AppText variant="small" tone="muted">
                One of you shows a code, the other scans it. You&apos;re connected, and since you met in person, you can vouch for each other.
              </AppText>
              {qr ? (
                <View style={{ alignItems: 'center', gap: t.space[2] }}>
                  <View
                    accessible
                    accessibilityLabel="Your QR code. Ask them to scan it with I'm In."
                    style={{ padding: t.space[3], backgroundColor: '#FFFFFF', borderRadius: t.radius.md }}>
                    <QRCode value={qrLink(qr.code)} size={200} color="#000000" backgroundColor="#FFFFFF" />
                  </View>
                  <AppText variant="caption" tone="subtle" align="center">
                    Works once, for {minutesLeft(qr.expires_at)} more minute{minutesLeft(qr.expires_at) === 1 ? '' : 's'}.
                  </AppText>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button label={qr ? 'New code' : 'Show my code'} size="md" variant="secondary" style={{ flex: 1 }} onPress={makeQr} />
                <Button label="Scan theirs" size="md" style={{ flex: 1 }} onPress={() => router.push('/connect/scan')} />
              </View>
            </View>
          </Card>
        </Section>

        <Section title="Know each other outside the app?">
          <Card>
            <View style={{ gap: t.space[3] }}>
              <GlyphTitle glyph="key">Share a code</GlyphTitle>
              <AppText variant="small" tone="muted">
                Get a code and send it to them (text, email, however you like). They type it in, and you&apos;re connected.
              </AppText>
              {shared ? (
                <View style={{ alignItems: 'center', gap: t.space[1] }}>
                  <AppText variant="h1" accessibilityLabel={`Your code: ${shared.code.split('').join(' ')}`} style={{ letterSpacing: 4 }}>
                    {prettyCode(shared.code)}
                  </AppText>
                  <AppText variant="caption" tone="subtle">
                    Works once, for 24 hours.
                  </AppText>
                </View>
              ) : null}
              {shared ? (
                <Button label="Send the code" size="md" onPress={shareCode} />
              ) : (
                <Button label="Get a code" size="md" variant="secondary" onPress={makeCode} />
              )}
            </View>
          </Card>
          <Card>
            <View style={{ gap: t.space[3] }}>
              <GlyphTitle glyph="link">Got a code from someone?</GlyphTitle>
              <TextField
                label="Their code"
                value={typed}
                onChangeText={(v) => setTyped(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                placeholder="ABC-123"
                onSubmitEditing={connect}
                returnKeyType="go"
              />
              <Button label="Connect" size="md" onPress={connect} loading={busy} disabled={typed.replace(/[^A-Za-z0-9]/g, '').length !== 6} />
            </View>
          </Card>
        </Section>

        <AppText variant="caption" tone="subtle" align="center">
          Only connect with people you actually know. You can also meet up and check in together (Circles → Check in), or ask a mutual friend for an intro.
        </AppText>
      </Screen>
    </View>
  );
}
