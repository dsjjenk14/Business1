import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, LoadingList, Screen, TextField, useToast } from '@/components/ui';
import { requestIntro } from '@/features/circles/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
import { goBackOr } from '@/lib/navigation';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** 2nd degree: ask a mutual friend to introduce you. */
export default function RequestIntro() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { target } = useLocalSearchParams<{ target: string }>();
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [via, setVia] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfileCard(target).then((c) => {
      if (cancelled || !c) return;
      setCard(c);
      setVia(c.via[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  async function send() {
    if (!via) return;
    setBusy(true);
    setError(null);
    try {
      await requestIntro(target, via, note);
      toast(`Asked ${card?.via.find((v) => v.id === via)?.display_name ?? 'your friend'} for an intro`);
      goBackOr(router, '/circles');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const first = card?.display_name.split(' ')[0] ?? '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Request an Intro" />
      <Screen>
        {card ? (
          <>
            <View style={{ alignItems: 'center', gap: t.space[2] }}>
              <Avatar name={card.display_name} uri={card.avatar_url} size={72} />
              <AppText variant="h2">{card.display_name}</AppText>
              <AppText variant="small" tone="muted" align="center">
                {first} is one intro away. Pick who to ask. If they make the intro and you both say yes, you can message right away.
              </AppText>
            </View>
            <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
              <AppText variant="label" tone="subtle">
                Ask
              </AppText>
              {card.via.map((v) => {
                const sel = v.id === via;
                return (
                  <Pressable
                    key={v.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    aria-checked={sel}
                    onPress={() => setVia(v.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.space[3],
                      padding: t.space[3],
                      borderRadius: t.radius.md,
                      borderWidth: t.borderWidth.regular,
                      borderColor: sel ? t.colors.primary : t.colors.border,
                      backgroundColor: t.colors.surface,
                    }}>
                    <Avatar name={v.display_name} size={36} />
                    <AppText weight="bold" style={{ flex: 1 }}>
                      {v.display_name}
                    </AppText>
                    <AppText variant="caption" tone="subtle">
                      knows you both
                    </AppText>
                  </Pressable>
                );
              })}
              {card.via.length === 0 ? (
                <AppText variant="small" tone="muted">
                  You don&apos;t share anyone with {first} yet.
                </AppText>
              ) : null}
            </View>
            <TextField
              label="Why you'd like to meet"
              optional
              value={note}
              onChangeText={setNote}
              maxLength={300}
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }}
            />
            {error ? (
              <AppText tone="danger" accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}
            <Button label="Send request" onPress={send} loading={busy} disabled={!via} />
          </>
        ) : (
          <LoadingList />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
