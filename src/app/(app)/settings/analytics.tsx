import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Screen, Section } from '@/components/ui';
import { fetchAnalytics, type Analytics } from '@/features/plan/api';
import { useTheme } from '@/theme';

/** Profile analytics (Premium): views and activity, counts only. Never who, by name. */
export default function ProfileAnalytics() {
  const t = useTheme();
  const router = useRouter();
  const [a, setA] = useState<Analytics | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchAnalytics()
        .then(setA)
        .catch(() => undefined);
    }, []),
  );

  const stat = (n: number, label: string, tone: 'text' | 'trust' | 'ai' | 'primary' = 'text') => (
    <Card style={{ flex: 1, alignItems: 'center' }}>
      <AppText variant="number" tone={tone}>
        {n}
      </AppText>
      <AppText variant="label" tone="subtle" align="center">
        {label}
      </AppText>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Profile Analytics" />
      <Screen contentGap={t.space[4]}>
        {!a ? (
          <AppText tone="subtle">Loading…</AppText>
        ) : a.locked ? (
          <Card accent="sponsored">
            <AppText weight="bold">A Premium feature</AppText>
            <AppText variant="small" tone="muted">
              See how many people view your profile and how your pins are doing.
            </AppText>
            <Button label="See Premium" size="md" onPress={() => router.push('/premium')} />
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              {stat(a.views_7d, 'Views · 7 days', 'primary')}
              {stat(a.views_30d, 'Views · 30 days')}
            </View>
            <Section title="Last 14 days">
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96 }} accessibilityLabel="Profile views per day, last 14 days">
                {a.daily.map((d) => {
                  const max = Math.max(1, ...a.daily.map((x) => x.views));
                  return (
                    <View
                      key={d.day}
                      style={{ flex: 1, height: Math.max(4, (d.views / max) * 96), borderRadius: 4, backgroundColor: d.views ? t.colors.primary : t.colors.surfaceAlt }}
                    />
                  );
                })}
              </View>
            </Section>
            <Section title="Who viewed you · 30 days">
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                {stat(a.viewers_circle_30d, 'Your circle', 'trust')}
                {stat(a.viewers_network_30d, 'Your network', 'ai')}
                {stat(a.viewers_other_30d, 'Others')}
              </View>
              <AppText variant="caption" tone="subtle">
                Counts only. Nobody is ever told you looked at their profile, and you&apos;re not told who looked at yours.
              </AppText>
            </Section>
            <Section title="Activity · 30 days">
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                {stat(a.pin_likes_30d, 'Likes on pins')}
                {stat(a.pin_replies_30d, 'Replies')}
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                {stat(a.vouches_30d, 'Vouches', 'trust')}
                {stat(a.intro_requests_30d, 'Intro requests', 'ai')}
              </View>
            </Section>
          </>
        )}
      </Screen>
    </View>
  );
}
