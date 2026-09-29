import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme';

/** First screen: Log In / Create Account. */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bg,
        paddingTop: insets.top + t.space[8],
        paddingBottom: insets.bottom + t.space[6],
        paddingHorizontal: t.space[6],
        justifyContent: 'space-between',
      }}>
      <View style={{ gap: t.space[6], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <Logo size={40} />
        <View style={{ gap: t.space[3] }}>
          <AppText variant="hero" accessibilityRole="header">
            Real people.{'\n'}Real trust.
          </AppText>
          <AppText variant="body" tone="muted">
            See where everyone’s going tonight, make plans with your Insiders, and meet people others vouch for.
          </AppText>
        </View>
      </View>

      <View style={{ gap: t.space[3], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
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
