import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { IntroOddsPanel } from '@/components/ai/IntroOddsPanel';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, GlyphTitle, Screen, TextField, useToast } from '@/components/ui';
import { fetchCircle, makeIntro, type CircleOverview } from '@/features/circles/api';
import { goBackOr } from '@/lib/navigation';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Option = { id: string; display_name: string; avatar_emoji: string | null; avatar_url: string | null; vouch_count: number | null; degree: 1 | 2 };

/**
 * Make an Intro: pick two people you know and say why they should meet.
 * Both have to accept. You're credited as the connector.
 * Once both are picked, the odds they actually meet up show live.
 */
export default function MakeIntro() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ a?: string; b?: string; request?: string; message?: string }>();
  const [circle, setCircle] = useState<CircleOverview | null>(null);
  const [a, setA] = useState<string | null>(params.a ?? null);
  const [b, setB] = useState<string | null>(params.b ?? null);
  const [message, setMessage] = useState(params.message ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromRequest = !!params.request;

  useFocusEffect(
    useCallback(() => {
      fetchCircle().then(setCircle).catch(() => {});
    }, []),
  );

  const first: Option[] = (circle?.first ?? []).map((p) => ({ ...p, degree: 1 }));
  const second: Option[] = (circle?.second ?? []).map((p) => ({ ...p, degree: 2 }));
  const all = [...first, ...second];

  async function send() {
    if (!a || !b) {
      setError('Pick both people.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await makeIntro(a, b, message, params.request ? Number(params.request) : undefined);
      toast('Intro sent');
      goBackOr(router, '/circles');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const picker = (label: string, options: Option[], value: string | null, onPick: (id: string) => void, exclude: string | null) => (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        {label}
      </AppText>
      <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
        {options
          .filter((o) => o.id !== exclude)
          .map((o) => {
            const sel = o.id === value;
            return (
              <Pressable
                key={o.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel, disabled: fromRequest }}
                aria-checked={sel}
                disabled={fromRequest}
                onPress={() => onPick(o.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[3],
                  padding: t.space[3],
                  borderRadius: t.radius.md,
                  borderWidth: t.borderWidth.regular,
                  borderColor: sel ? t.colors.primary : t.colors.border,
                  backgroundColor: t.colors.surface,
                  opacity: fromRequest && !sel ? 0.4 : 1,
                }}>
                <Avatar name={o.display_name} uri={o.avatar_url} size={36} />
                <AppText weight="bold" style={{ flex: 1 }}>
                  {o.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {o.vouch_count != null ? `${o.vouch_count} ✓ · ` : ''}
                  {o.degree === 1 ? '1st' : '2nd'} degree
                </AppText>
              </Pressable>
            );
          })}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Make an Intro" />
      <Screen>
        <Card accent="primary">
          <GlyphTitle glyph="connect">You are the connector</GlyphTitle>
          <AppText variant="small" tone="muted">
            Both people see your name as the person who made it happen. Your reputation travels with this intro. Once they both accept, they
            can message each other right away.
          </AppText>
        </Card>
        {picker('First person · your circle', fromRequest ? all.filter((o) => o.id === a) : first, a, setA, b)}
        {picker('Second person', fromRequest ? all.filter((o) => o.id === b) : all, b, setB, a)}
        {a && b ? <IntroOddsPanel a={a} b={b} /> : null}
        <TextField
          label="Why they should meet"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          placeholder="You both love a long dinner and a good playlist…"
          style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
          hint="Both people see this."
        />
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Send the Intro" onPress={send} loading={busy} disabled={!a || !b || !message.trim()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
