import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTitle, LoadingList, Screen } from '@/components/ui';
import { fetchMyPlan, type MyPlan } from '@/features/plan/api';
import { useTheme } from '@/theme';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** Your plan and billing. */
export default function Plan() {
  const t = useTheme();
  const router = useRouter();
  const [plan, setPlan] = useState<MyPlan | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchMyPlan()
        .then(setPlan)
        .catch(() => undefined);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Your Plan" />
      <Screen contentGap={t.space[4]}>
        {!plan ? (
          <LoadingList />
        ) : plan.is_premium ? (
          <Card accent="sponsored">
            <GlyphTitle glyph="star" tone="sponsored">
              Premium
            </GlyphTitle>
            <AppText variant="small" tone="muted">
              {plan.source === 'founding'
                ? `Free as Founding Member #${plan.member_number}, until ${plan.premium_until ? fmt(plan.premium_until) : '—'}. After that it's optional.`
                : plan.source === 'admin'
                  ? `Given by the I'm In team, until ${plan.premium_until ? fmt(plan.premium_until) : '—'}.`
                  : `Renews ${plan.premium_until ? fmt(plan.premium_until) : '—'}. Manage or cancel on the Premium screen.`}
            </AppText>
          </Card>
        ) : (
          <Card>
            <AppText weight="bold">Free plan</AppText>
            <AppText variant="small" tone="muted">
              {plan.premium_until ? `Premium ended ${fmt(plan.premium_until)}.` : 'Everything you need to meet people you can trust.'}
            </AppText>
          </Card>
        )}
        <Button label={plan?.is_premium ? 'Premium: keep, manage or cancel' : 'Get Premium'} onPress={() => router.push('/premium')} />
        {plan?.is_premium ? <Button label="Profile analytics" variant="secondary" onPress={() => router.push('/settings/analytics')} /> : null}
      </Screen>
    </View>
  );
}
