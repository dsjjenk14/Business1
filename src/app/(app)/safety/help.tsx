import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTile, Screen, useToast, type GlyphName } from '@/components/ui';
import {
  alertMessage,
  markContactsNotified,
  raiseSafetyAlert,
  resolveSafetyAlert,
  type AlertInfo,
  type SafetyLevel,
} from '@/features/safety/api';
import { goBackOr } from '@/lib/navigation';
import { callNumber, openSms } from '@/lib/sms';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Step = 'ask' | 'unsafe' | 'leaving' | 'emergency';

async function currentLocation() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * "I need help": I feel unsafe → I need to leave → Emergency. Each step texts
 * your trusted contacts your location from your own phone (you tap Send), and
 * Emergency calls 911.
 */
export default function Help() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>('ask');
  const [info, setInfo] = useState<AlertInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function alert(level: SafetyLevel) {
    setBusy(true);
    try {
      const coords = await currentLocation();
      const result = await raiseSafetyAlert(level, coords);
      setInfo(result);
      setStep(level);
      if (level === 'emergency') await callNumber('911');
      if (result.contacts.length) {
        await openSms(
          result.contacts.map((c) => c.phone),
          alertMessage(level, result, coords),
        );
        await markContactsNotified(result.alert_id, result.contacts.length);
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function safe() {
    setBusy(true);
    try {
      await resolveSafetyAlert();
      if (info?.contacts.length) {
        await openSms(
          info.contacts.map((c) => c.phone),
          `${info.name} here: I'm safe now. Thank you for being there.`,
        );
      }
      toast("Glad you're safe");
      goBackOr(router, '/');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const hero = (glyph: GlyphName, title: string, body: string) => (
    <View style={{ alignItems: 'center', gap: t.space[2] }}>
      <GlyphTile name={glyph} size={72} tone="primary" />
      <AppText variant="h2" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="muted" align="center">
        {body}
      </AppText>
    </View>
  );

  const contactsNote =
    info && info.contacts.length === 0 ? (
      <Card accent="sponsored">
        <AppText weight="bold">No trusted contacts yet</AppText>
        <AppText variant="small" tone="muted">
          Add someone who can get your location if you need help.
        </AppText>
        <Button label="Add a trusted contact" size="md" variant="secondary" onPress={() => router.push('/safety')} />
      </Card>
    ) : info ? (
      <AppText variant="small" tone="muted" align="center">
        Messages opened with {info.contacts.map((c) => c.name).join(', ')} and your location. Make sure you tapped Send.
      </AppText>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={step === 'emergency' ? 'Emergency' : 'I Need Help'} />
      <Screen contentGap={t.space[5]}>
        {step === 'ask' ? (
          <>
            {hero('siren', 'Are you safe?', 'Your trusted contacts get a text with your location.')}
            <Button label="I feel unsafe: alert my contacts" variant="secondary" onPress={() => alert('unsafe')} loading={busy} />
            <Button label="I need to leave now" variant="secondary" onPress={() => alert('leaving')} disabled={busy} />
            <Button label="Emergency: call 911" variant="danger" onPress={() => alert('emergency')} disabled={busy} />
            <Button label="I'm okay, go back" variant="ghost" onPress={() => goBackOr(router, '/')} disabled={busy} />
          </>
        ) : step === 'unsafe' ? (
          <>
            {hero('warning', 'Contacts alerted', 'Your trusted contacts are getting your name and location.')}
            {contactsNote}
            <Button label="I need more help" variant="secondary" onPress={() => alert('leaving')} loading={busy} />
            <Button label="I'm safe now" variant="trust" onPress={safe} disabled={busy} />
          </>
        ) : step === 'leaving' ? (
          <>
            {hero('exit', 'Get out safely', 'Your contacts have your location and know you’re leaving. Head somewhere busy and well lit.')}
            {contactsNote}
            <Button label="Send my location again" variant="secondary" onPress={() => alert('leaving')} loading={busy} />
            <Button label="Escalate to emergency" variant="danger" onPress={() => alert('emergency')} disabled={busy} />
            <Button label="I'm safe, stop" variant="trust" onPress={safe} disabled={busy} />
          </>
        ) : (
          <>
            {hero('siren', 'Emergency', 'Call 911. Your contacts are getting your location.')}
            <Button label="Call 911" variant="danger" onPress={() => callNumber('911')} />
            {contactsNote}
            <Button label="Text my contacts again" variant="secondary" onPress={() => alert('emergency')} loading={busy} />
            <Button label="I'm safe, cancel" variant="ghost" onPress={safe} disabled={busy} />
          </>
        )}
      </Screen>
    </View>
  );
}
