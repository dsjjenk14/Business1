import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, SpecialSticker, Card, LoadingDetail, Screen, Section, useToast, LegalNote } from '@/components/ui';
import { fetchBackgroundCheck, startBackgroundCheck, type BackgroundCheckStatus } from '@/features/safety/backgroundCheck';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Get a background check. You agree first; you pay once, or it's free after
 * 30 days of Premium. A clear result puts a "Background checked" tag on your
 * profile. Nothing else about the check is ever shown to anyone.
 */
export default function BackgroundCheck() {
  const t = useTheme();
  const toast = useToast();
  const [status, setStatus] = useState<BackgroundCheckStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchBackgroundCheck()
      .then(setStatus)
      .catch((e) => toast(friendlyError(e)));
  }, [toast]);
  useFocusEffect(load);

  async function start() {
    setBusy(true);
    try {
      const { paid } = await startBackgroundCheck();
      toast(paid ? 'Thanks. Your check starts once the payment goes through.' : 'Your background check has started.');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <>
        <BackHeader title="Background check" />
        <LoadingDetail />
      </>
    );
  }

  const inProgress = status.latest_status === 'pending';
  const waitingToPay = status.latest_status === 'awaiting_payment';
  const notClear = status.latest_status === 'not_clear' && !status.checked;
  const priceLine = status.free
    ? 'Free for you with Premium.'
    : status.is_premium && status.free_on
      ? `${money(status.price_cents)} one time, or free with Premium on ${day(status.free_on)}.`
      : `${money(status.price_cents)} one time. Free after ${status.premium_days} days of Premium.`;

  return (
    <>
      <BackHeader title="Background check" />
      <Screen>
        <View style={{ alignItems: 'center', gap: t.space[3] }}>
          <View style={{ transform: [{ scale: 2 }], marginVertical: 24 }}>
            <SpecialSticker label="Background checked" glyph="shield" />
          </View>
          <AppText variant="h1" align="center" accessibilityRole="header">
            Show people you&apos;re safe to meet
          </AppText>
          <AppText tone="muted" align="center">
            Get a background check, and a Background checked tag goes on your profile so people know before they meet you.
          </AppText>
        </View>

        {status.checked && status.checked_at ? (
          <Card accent="trust">
            <AppText weight="bold" tone="trust">
              You&apos;re background checked
            </AppText>
            <AppText variant="small" tone="muted">
              Your tag shows on your profile. Checked {day(status.checked_at)}; it lasts a year.
            </AppText>
          </Card>
        ) : inProgress ? (
          <Card>
            <AppText weight="bold">Your check is in progress</AppText>
            <AppText variant="small" tone="muted">
              It usually takes a few days. We&apos;ll let you know when it&apos;s done.
            </AppText>
          </Card>
        ) : (
          <>
            <Section title="How it works">
              {[
                'A trusted background-check company checks public records, like criminal records and the sex offender registry.',
                'If it comes back clear, the Background checked tag goes on your profile for a year.',
                'Nobody sees your results, just the tag. If it doesn’t come back clear, only you are told, and nothing changes on your profile.',
              ].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Ionicons name="checkmark-circle" size={18} color={t.colors.trust} style={{ marginTop: 2 }} />
                  <AppText variant="small" style={{ flex: 1 }}>
                    {line}
                  </AppText>
                </View>
              ))}
            </Section>

            {notClear ? (
              <Card>
                <AppText weight="bold">Your last check didn&apos;t come back clear</AppText>
                <AppText variant="small" tone="muted">
                  Only you can see this. The company that ran it emails you a copy of what they found and how to dispute anything that&apos;s wrong.
                </AppText>
              </Card>
            ) : null}

            <Section title="Price">
              <AppText>{priceLine}</AppText>
            </Section>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              onPress={() => setAgreed((v) => !v)}
              style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start', minHeight: 44 }}>
              <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={24} color={agreed ? t.colors.primary : t.colors.textMuted} />
              <AppText variant="small" style={{ flex: 1 }}>
                I authorize I&apos;m In&apos;s independent background-check company (a consumer reporting agency) to get a report about me from public records, including criminal records and sex offender registries. I&apos;ll confirm my details with them, they&apos;ll give me a copy of my report, and I can dispute anything wrong with them for free. I&apos;m In only learns whether it came back clear.
              </AppText>
            </Pressable>

            <LegalNote>The badge means no records were found in the searches run, as of that date. It isn&apos;t a guarantee. The fee can&apos;t be refunded once the check starts.</LegalNote>

            {status.enabled ? (
              <Button
                label={waitingToPay ? 'Finish paying' : status.free ? 'Start my background check' : `Start my background check · ${money(status.price_cents)}`}
                onPress={start}
                loading={busy}
                disabled={!agreed}
              />
            ) : (
              <>
                <Button label="Coming soon" disabled onPress={() => undefined} />
                <AppText variant="caption" tone="subtle" align="center">
                  Background checks open soon. We&apos;ll let you know.
                </AppText>
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
