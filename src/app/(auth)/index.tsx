import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme';

/** An example group chat (not real people) that plays in when the screen opens. */
const CHAT: { who?: string; tone?: 'secondary' | 'trust' | 'ai'; text: string; mine?: boolean }[] = [
  { who: 'Maya', tone: 'secondary', text: 'who’s out tonight?? dinner in Shaw at 8' },
  { who: 'Jordan', tone: 'trust', text: 'I’m in' },
  { text: 'me too, saving you a seat', mine: true },
  { who: 'Naomi', tone: 'ai', text: 'omw' },
];

/** First screen: a group chat deciding on tonight, then "Are you in?" with Create Account / Log In. */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [still, setStill] = useState<boolean | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => setStill(false));
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bg,
        paddingTop: insets.top + t.space[6],
        paddingBottom: insets.bottom + t.space[6],
        paddingHorizontal: t.space[5],
      }}>
      <View style={{ flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', gap: t.space[4] }}>
        <Logo size={30} />

        {/* Decorative example chat; screen readers skip it. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, justifyContent: 'center', gap: t.space[2] }}>
          {still === null
            ? null
            : CHAT.map((m, i) => (
                <Animated.View
                  key={i}
                  entering={still ? undefined : FadeInDown.delay(250 + i * 650).duration(350)}
                  style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  <View
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      borderBottomLeftRadius: m.mine ? 20 : 6,
                      borderBottomRightRadius: m.mine ? 6 : 20,
                      backgroundColor: m.mine ? t.colors.primary : t.colors.surface,
                    }}>
                    {m.who ? (
                      <AppText variant="small" weight="bold" style={{ color: t.colors[m.tone ?? 'secondary'] }}>
                        {m.who}
                      </AppText>
                    ) : null}
                    <AppText style={m.mine ? { color: t.colors.onPrimary, fontWeight: '600' } : undefined}>{m.text}</AppText>
                  </View>
                </Animated.View>
              ))}
        </View>

        <View style={{ gap: t.space[3] }}>
          <AppText variant="hero" accessibilityRole="header" style={{ fontSize: 48, lineHeight: 52 }}>
            Are you{' '}
            <AppText variant="hero" tone="primary" style={{ fontSize: 48, lineHeight: 52 }}>
              in
            </AppText>
            ?
          </AppText>
          <AppText tone="muted">See who&apos;s going out, say I&apos;m In, and meet people your friends vouch for.</AppText>
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
    </View>
  );
}
