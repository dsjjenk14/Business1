import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AIMark, AppText, Button, Card, useToast } from '@/components/ui';
import { aiErrorText, quotaText, runAI, type AIQuota, type Icebreakers } from '@/features/ai/api';
import { track } from '@/features/analytics/track';
import { useTheme } from '@/theme';

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
            For once an Insider you share introduces you.
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
