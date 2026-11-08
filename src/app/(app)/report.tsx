import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { SafetyHelp } from '@/components/safety/SafetyHelp';
import { AppText, Button, Screen, TextField, useToast } from '@/components/ui';
import { REPORT_REASONS, SERIOUS_REASONS, blockUser, report, reportDate, type ReportReason } from '@/features/safety/api';
import { goBackOr } from '@/lib/navigation';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Report a member, a pin, or a reply. Optionally block them at the same time. */
export default function Report() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  // date=1 (or a date request id): report the whole date with this person.
  const params = useLocalSearchParams<{ user?: string; pin?: string; reply?: string; message?: string; name?: string; date?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a serious report, stay on a page with help instead of going back.
  const [sent, setSent] = useState(false);
  const serious = !!reason && SERIOUS_REASONS.includes(reason);

  const isDate = !!params.date && !!params.user;
  const what = isDate ? `your date with ${params.name ?? 'this member'}` : params.pin ? 'this pin' : params.reply ? 'this reply' : params.message ? 'this message' : params.name ?? 'this member';

  async function submit() {
    if (!reason) {
      setError('Pick what happened.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isDate)
        await reportDate({ otherId: params.user as string, reason, details, dateId: params.date && params.date !== '1' ? Number(params.date) : undefined });
      else await report({
        reason,
        details,
        userId: params.user,
        pinId: params.pin ? Number(params.pin) : undefined,
        replyId: params.reply ? Number(params.reply) : undefined,
        messageId: params.message ? Number(params.message) : undefined,
      });
      if (alsoBlock && params.user && !serious) await blockUser(params.user);
      if (serious) {
        setSent(true);
        return;
      }
      toast(alsoBlock ? 'Reported and blocked. Thank you.' : 'Report sent. Thank you for keeping I’m In safe.');
      goBackOr(router, '/');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent && reason && serious)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Report sent" />
        <Screen>
          <AppText variant="h2" accessibilityRole="header">
            We got your report.
          </AppText>
          <AppText tone="muted">
            Our team is reviewing it first, before anything else. You two can’t see or contact each other on I’m In anymore. They’ll never
            know who reported them. We’ll let you know when we’ve finished.
          </AppText>
          <SafetyHelp kind={reason === 'assault' ? 'assault' : 'violence'} />
          <Button label="Done" variant="secondary" onPress={() => goBackOr(router, '/')} />
        </Screen>
      </View>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Report" />
      <Screen>
        <AppText tone="muted">
          Reports are confidential. They&apos;ll never know who reported them, and anything we do about it reaches them hours later, so the
          timing doesn&apos;t give you away. We review reports promptly, usually within 24 hours. If you&apos;re in danger, call 911.
        </AppText>
        <AppText variant="label" tone="subtle">
          What happened with {what}?
        </AppText>
        <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
          {REPORT_REASONS.map((r) => {
            const sel = r.key === reason;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel }}
                aria-checked={sel}
                onPress={() => setReason(r.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[3],
                  padding: t.space[3],
                  borderRadius: t.radius.md,
                  borderWidth: t.borderWidth.regular,
                  borderColor: sel ? t.colors.danger : t.colors.border,
                  backgroundColor: t.colors.surface,
                }}>
                <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={20} color={sel ? t.colors.danger : t.colors.textSubtle} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">{r.label}</AppText>
                  <AppText variant="small" tone="muted">
                    {r.detail}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <TextField
          label="Details"
          optional
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={2000}
          style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
        />
        {serious ? <SafetyHelp kind={reason === 'assault' ? 'assault' : 'violence'} /> : null}
        {params.user && !serious ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <View style={{ flex: 1 }}>
              <AppText weight="bold">Also block {params.name ?? 'them'}</AppText>
              <AppText variant="small" tone="muted">
                You won&apos;t see each other anywhere on I&apos;m In. They aren&apos;t told.
              </AppText>
            </View>
            <Switch accessibilityLabel="Also block this member" value={alsoBlock} onValueChange={setAlsoBlock} trackColor={{ true: t.colors.danger, false: t.colors.surfaceAlt }} />
          </View>
        ) : null}
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Send report" variant="danger" onPress={submit} loading={busy} disabled={!reason} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
