import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AIMark, AppText, Badge, Button, Card, useToast } from '@/components/ui';
import { aiErrorText, quotaText, runAI, type AIQuota, type Icebreakers, type ProfileRead } from '@/features/ai/api';
import { track } from '@/features/analytics/track';
import { useTheme } from '@/theme';

/**
 * AI Read: up to 3 descriptive badges and a two-sentence read of how someone
 * moves socially, from their vouches, groups, events and open plans (never
 * messages). Everyone sees the same read; whoever asks first uses one AI use.
 */
export function AIRead({ userId, firstName, initial }: { userId: string; firstName: string; initial: ProfileRead | null | undefined }) {
  const t = useTheme();
  const toast = useToast();
  const [read, setRead] = useState<ProfileRead | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<AIQuota | null>(null);

  async function make() {
    setBusy(true);
    try {
      const r = await runAI<ProfileRead>('profile_read', { subject: userId });
      setRead(r.result);
      setQuota(r.quota);
      track('ai_used', { feature: 'profile_read', cached: r.cached });
    } catch (e) {
      toast(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="ai">
      <View style={{ gap: t.space[2] }}>
        <AIMark label="AI Read" />
        {read?.read ? (
          <>
            {read.badges.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {read.badges.map((b) => (
                  <View key={b.label} accessible accessibilityLabel={`${b.label}: ${b.why}`}>
                    <Badge label={b.label} glyph="spark" tone="ai" />
                  </View>
                ))}
              </View>
            ) : null}
            <AppText variant="small">{read.read}</AppText>
            <AppText variant="caption" tone="subtle">
              From vouches, groups, events and open plans. Never messages.
            </AppText>
          </>
        ) : read?.thin ? (
          <AppText variant="small" tone="muted">
            Not enough activity yet for a read on {firstName}. Check back after a few nights out.
          </AppText>
        ) : (
          <>
            <AppText variant="small" tone="muted">
              A quick read on how {firstName} moves socially, from their vouches, groups and nights out.
            </AppText>
            <Button label="Get the AI Read" size="md" variant="secondary" onPress={make} loading={busy} />
          </>
        )}
        {quotaText(quota) ? (
          <AppText variant="caption" tone="subtle">
            {quotaText(quota)}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/** Three conversation starters for someone new. Tap one to copy it. */
export function IcebreakersCard({ userId, firstName, connected }: { userId: string; firstName: string; connected: boolean }) {
  const t = useTheme();
  const toast = useToast();
  const [list, setList] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<AIQuota | null>(null);

  async function load(refresh: boolean) {
    setBusy(true);
    try {
      const r = await runAI<Icebreakers>('icebreakers', { subject: userId, refresh });
      setList(r.result.icebreakers);
      setQuota(r.quota);
      track('ai_used', { feature: 'icebreakers', refresh, cached: r.cached });
    } catch (e) {
      toast(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    toast('Copied');
  }

  if (!list) {
    return (
      <Button
        label={`Icebreakers for ${firstName}`}
        variant="secondary"
        size="md"
        onPress={() => load(false)}
        loading={busy}
        accessibilityLabel={`AI icebreakers for ${firstName}`}
      />
    );
  }
  return (
    <Card accent="ai">
      <View style={{ gap: t.space[2] }}>
        <AIMark label="Icebreakers" />
        {!connected ? (
          <AppText variant="caption" tone="subtle">
            For once a friend you share introduces you.
          </AppText>
        ) : null}
        {list.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`Copy: ${s}`}
            onPress={() => copy(s)}
            style={({ pressed }) => ({
              padding: t.space[3],
              borderRadius: t.radius.md,
              borderWidth: t.borderWidth.hairline,
              borderColor: t.colors.border,
              backgroundColor: t.colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}>
            <AppText variant="small">{s}</AppText>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="subtle">
            Tap one to copy{quotaText(quota) ? ` · ${quotaText(quota)}` : ''}
          </AppText>
          <Button label="New ones" size="md" variant="ghost" onPress={() => load(true)} loading={busy} />
        </View>
      </View>
    </Card>
  );
}
