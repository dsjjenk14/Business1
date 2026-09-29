import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTile, Screen, Section, useToast, type GlyphName } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { track } from '@/features/analytics/track';
import { openPayment } from '@/features/payments/api';
import { PREMIUM_PRICE, fetchMyPlan, type MyPlan } from '@/features/plan/api';
import { useTheme } from '@/theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** Premium: price and trial, what free limits and what Premium removes, and a comparison table. */
export default function Premium() {
  const t = useTheme();
  const toast = useToast();
  const { planLimits } = useAppConfig();
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    fetchMyPlan()
      .then(setPlan)
      .catch(() => undefined);
  }, []);

  async function pay(action: 'premium' | 'manage_premium') {
    setBusy(true);
    try {
      if (action === 'premium') track('premium_checkout_opened');
      await openPayment(action);
      refresh();
      // The payment is confirmed by Stripe a moment later; check again shortly.
      setTimeout(refresh, 4000);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payments aren’t available right now.');
    } finally {
      setBusy(false);
    }
  }

  useFocusEffect(refresh);

  const lim = (key: string) => planLimits[key];
  const exchanges = lim('messaging_min_exchanges')?.free ?? 5;
  const aiFree = lim('ai_uses')?.free ?? 3;

  // Everyone can pay from here: new members, members on free Premium (billing
  // starts when the free months end), and subscribers (manage or cancel).
  const payButton = !plan ? null : plan.subscribed ? (
    <Button label="Manage or cancel" variant="secondary" onPress={() => pay('manage_premium')} loading={busy} />
  ) : plan.is_premium && plan.premium_until ? (
    <View style={{ gap: t.space[1] }}>
      <Button label={`Keep Premium · ${PREMIUM_PRICE}/month`} onPress={() => pay('premium')} loading={busy} />
      <AppText variant="caption" tone="subtle" align="center">
        Add a card now. You won&apos;t be charged until {fmtDate(plan.premium_until)}.
      </AppText>
    </View>
  ) : (
    <Button label={`Get Premium · ${PREMIUM_PRICE}/month`} onPress={() => pay('premium')} loading={busy} />
  );

  const vouches = lim('vouches_per_month')?.free ?? 5;
  const features: { glyph: GlyphName; title: string; free: string; premium: string }[] = [
    { glyph: 'medal', title: 'Unlimited vouches', free: `${vouches} vouches a month`, premium: 'Vouch for everyone you meet, no monthly limit' },
    { glyph: 'chat', title: 'Message sooner', free: `${exchanges} back-and-forths before messaging one of your Insiders`, premium: 'Message your Insiders right away (intros still come first for everyone else)' },
    { glyph: 'spark', title: 'AI without limits', free: `${aiFree} AI uses in total`, premium: 'Unlimited icebreakers, tonight picks and more' },
    { glyph: 'flame', title: 'Priority on Tonight', free: 'Standard placement', premium: 'Your plans show near the top of Tonight' },
    { glyph: 'clock', title: 'Profile analytics', free: 'Not included', premium: 'Views, who they are (Insiders / Network / others), and activity' },
    { glyph: 'star', title: 'Premium badge', free: 'Not included', premium: 'A Premium badge on your profile' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Premium" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <GlyphTile name="star" size={64} tone="sponsored" />
          <AppText variant="h1" align="center" accessibilityRole="header">
            I&apos;m In Premium
          </AppText>
          <AppText variant="h3" tone="sponsored" align="center">
            {PREMIUM_PRICE}/month
          </AppText>
          <AppText tone="muted" align="center">
            Founding Members get 3 months free.
          </AppText>
        </View>

        {plan?.is_premium && plan.premium_until ? (
          <Card accent="sponsored">
            <AppText weight="bold">You have Premium</AppText>
            <AppText variant="small" tone="muted">
              {plan.source === 'founding'
                ? `Founding Member #${plan.member_number}: free until ${fmtDate(plan.premium_until)}.`
                : plan.subscribed
                  ? `Renews monthly. Paid through ${fmtDate(plan.premium_until)}.`
                  : `Active until ${fmtDate(plan.premium_until)}.`}
            </AppText>
          </Card>
        ) : null}

        {payButton}

        <View style={{ gap: t.space[3] }}>
          {features.map((f) => (
            <Card key={f.title}>
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                <GlyphTile name={f.glyph} size={40} tone="sponsored" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold">{f.title}</AppText>
                  <AppText variant="small" tone="subtle">
                    Free: {f.free}
                  </AppText>
                  <AppText variant="small" tone="sponsored">
                    Premium: {f.premium}
                  </AppText>
                </View>
              </View>
            </Card>
          ))}
        </View>

        <Section title="Compare">
          <View style={{ borderRadius: t.radius.md, borderWidth: t.borderWidth.hairline, borderColor: t.colors.border, overflow: 'hidden' }}>
            {[
              ['', 'Free', 'Premium'],
              ['Vouches', `${vouches} a month`, 'Unlimited'],
              ['Messaging', `After ${exchanges}`, 'Right away'],
              ['AI features', `${aiFree} uses`, 'Unlimited'],
              ['Tonight placement', 'Standard', 'Priority'],
              ['Profile analytics', 'No', 'Yes'],
              ['Premium badge', 'No', 'Yes'],
            ].map((row, i) => (
              <View
                key={row[0] || 'head'}
                style={{
                  flexDirection: 'row',
                  paddingVertical: t.space[2],
                  paddingHorizontal: t.space[3],
                  backgroundColor: i === 0 ? t.colors.surfaceAlt : i % 2 ? t.colors.surface : t.colors.bg,
                }}>
                {row.map((cell, j) => (
                  <AppText
                    key={j}
                    variant="small"
                    weight={i === 0 || j === 0 ? 'bold' : undefined}
                    tone={j === 2 && i > 0 ? 'sponsored' : j === 1 && i > 0 ? 'muted' : 'text'}
                    style={{ flex: j === 0 ? 1.4 : 1, textAlign: j === 0 ? 'left' : 'center' }}>
                    {cell}
                  </AppText>
                ))}
              </View>
            ))}
          </View>
        </Section>

        {payButton}
        <AppText variant="caption" tone="subtle" align="center">
          Premium never skips intros: people outside your Insiders are always one intro away, on every plan. Payments are handled by Stripe;
          cancel any time from this screen.
        </AppText>
      </Screen>
    </View>
  );
}
