import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { AppText, Button, Glyph, type GlyphName } from '@/components/ui';
import { useTheme } from '@/theme';

/** Example plans (not real people) that drift up behind the question. */
const SAMPLES: { glyph: GlyphName; title: string; detail: string; going: number }[] = [
  { glyph: 'dinner', title: 'Dinner in Shaw', detail: 'Tonight · 8 PM', going: 4 },
  { glyph: 'fitness', title: 'Saturday run club', detail: 'Sat · 7 AM', going: 12 },
  { glyph: 'music', title: 'Live music on U Street', detail: 'Fri · 9 PM', going: 7 },
  { glyph: 'drinks', title: 'Rooftop drinks', detail: 'Tonight · 7 PM', going: 5 },
  { glyph: 'brunch', title: 'Sunday brunch', detail: 'Sun · 11 AM', going: 6 },
  { glyph: 'art', title: 'Gallery night', detail: 'Thu · 6 PM', going: 9 },
];
const CARD_H = 76;
const GAP = 10;
const LOOP = SAMPLES.length * (CARD_H + GAP);

function PlanCard({ s }: { s: (typeof SAMPLES)[number] }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: CARD_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        paddingHorizontal: t.space[4],
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface,
        borderWidth: t.borderWidth.regular,
        borderColor: t.colors.border,
      }}>
      <Glyph name={s.glyph} size={24} tone="primary" />
      <View style={{ flex: 1 }}>
        <AppText weight="bold" numberOfLines={1}>
          {s.title}
        </AppText>
        <AppText variant="caption" tone="subtle">
          {s.detail} · {s.going} going
        </AppText>
      </View>
      <View style={{ paddingHorizontal: t.space[3], paddingVertical: 6, borderRadius: 999, backgroundColor: t.colors.primary }}>
        <AppText variant="caption" weight="bold" style={{ color: t.colors.onPrimary }}>
          I&apos;m In
        </AppText>
      </View>
    </View>
  );
}

/** A soft fade to the background color, made of thin bands (no gradient library needed). */
function Fade({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const t = useTheme();
  const bands = 12;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height, [edge]: 0 }}>
      {Array.from({ length: bands }, (_, i) => {
        // Strongest at the edge, clear toward the middle.
        const fromEdge = edge === 'top' ? i : bands - 1 - i;
        return <View key={i} style={{ flex: 1, backgroundColor: t.colors.bg, opacity: 1 - fromEdge / bands }} />;
      })}
    </View>
  );
}

/** First screen: example plans drift up, then "Are you in?" with Create Account / Log In. */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!live) return;
        if (reduce) setStill(true);
        else offset.value = withRepeat(withTiming(-LOOP, { duration: SAMPLES.length * 3500, easing: Easing.linear }), -1, false);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [offset]);

  const drift = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space[6], paddingBottom: insets.bottom + t.space[6] }}>
      <View style={{ paddingHorizontal: t.space[6], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <Logo size={32} />
      </View>

      {/* Example plans, fading out at the top and bottom. Decorative only. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flex: 1, overflow: 'hidden', marginVertical: t.space[4], paddingHorizontal: t.space[6], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <Animated.View style={[{ gap: GAP, paddingTop: t.space[4] }, still ? null : drift]}>
          {[...SAMPLES, ...SAMPLES].map((s, i) => (
            <PlanCard key={i} s={s} />
          ))}
        </Animated.View>
        <Fade edge="top" height={56} />
        <Fade edge="bottom" height={120} />
      </View>

      <View style={{ gap: t.space[4], paddingHorizontal: t.space[6], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="hero" accessibilityRole="header">
            Are you <AppText variant="hero" tone="primary">in</AppText>?
          </AppText>
          <AppText variant="body" tone="muted">
            DC&apos;s going-out app, built on real trust. See what&apos;s happening tonight, make plans with your Insiders, and meet people others vouch for.
          </AppText>
        </View>
        <Button label="Create Account" onPress={() => router.push('/signup')} />
        <Button label="Log In" variant="secondary" onPress={() => router.push('/login')} />
        <AppText variant="caption" tone="subtle" align="center">
          By continuing you agree to our{' '}
          <AppText variant="caption" tone="muted" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/terms')}>
            Terms
          </AppText>{' '}
          and{' '}
          <AppText variant="caption" tone="muted" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </AppText>
          .
        </AppText>
      </View>
    </View>
  );
}
