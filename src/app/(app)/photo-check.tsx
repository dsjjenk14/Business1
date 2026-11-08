import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/nav/Logo';
import { refreshAccountStatus, type AccountStatus } from '@/components/safety/AccountBlocked';
import { AppText, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/**
 * Everyone passes the photo check before using I'm In: add a real photo of
 * yourself, then take a live selfie doing a gesture. A person compares them.
 */
export default function PhotoCheck() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut, refreshProfile } = useAuth();
  const [s, setS] = useState<AccountStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setChecking(true);
    const next = await refreshAccountStatus();
    setChecking(false);
    setS(next);
    if (next && !next.needs_photo_check) {
      await refreshProfile();
      router.replace('/');
    }
  }, [refreshProfile]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasPhoto = !!s?.has_photo;
  const waiting = s?.photo_check === 'pending';
  const declined = s?.photo_check === 'declined';

  const step = (n: number, done: boolean, title: string, body: string, action?: React.ReactNode) => (
    <Card accent={!done && (n === 1 ? !hasPhoto : hasPhoto) ? 'primary' : undefined}>
      <View style={{ flexDirection: 'row', gap: t.space[3] }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? t.colors.trust : t.colors.surfaceAlt,
          }}>
          {done ? (
            <Ionicons name="checkmark" size={18} color={t.colors.onTrust} accessibilityLabel="Done" />
          ) : (
            <AppText weight="bold" variant="small">
              {n}
            </AppText>
          )}
        </View>
        <View style={{ flex: 1, gap: t.space[2] }}>
          <AppText weight="bold">{title}</AppText>
          <AppText variant="small" tone="muted">
            {body}
          </AppText>
          {action}
        </View>
      </View>
    </Card>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bg,
        paddingTop: insets.top + t.space[6],
        paddingBottom: insets.bottom + t.space[4],
        paddingHorizontal: t.space[5],
        gap: t.space[4],
      }}>
      <Logo size={30} />
      <ScrollView contentContainerStyle={{ gap: t.space[4], paddingBottom: t.space[4] }}>
        <View style={{ gap: t.space[2] }}>
          <AppText variant="h1" accessibilityRole="header">
            {waiting ? 'Almost in' : 'One quick check'}
          </AppText>
          <AppText tone="muted">
            {waiting
              ? 'A person is comparing your selfie with your photos, usually within a day. We’ll let you know as soon as you’re in.'
              : 'Everyone on I’m In is who their photos say they are. Add a real photo of yourself, then take a quick live selfie so a person can check it’s you.'}
          </AppText>
        </View>

        {declined ? (
          <Card accent="sponsored" style={{ gap: t.space[1] }}>
            <AppText weight="bold">Your last check wasn’t approved</AppText>
            <AppText variant="small" tone="muted">
              {s?.photo_check_note || 'The selfie didn’t match your photos, or the gesture wasn’t clear.'} Fix it, then try again.
            </AppText>
          </Card>
        ) : null}

        {step(
          1,
          hasPhoto,
          'Add a photo of you',
          'A clear, real photo of your face. No AI-made or AI-edited photos, and no one else’s.',
          <Button
            label={hasPhoto ? 'Change photos' : 'Add a photo'}
            size="md"
            variant={hasPhoto ? 'secondary' : 'primary'}
            onPress={() => router.push('/settings/photos')}
          />,
        )}
        {step(
          2,
          waiting,
          'Take a live selfie',
          'We’ll ask you to do a gesture, like a thumbs up, so we know it’s really you right now. Only reviewers see it.',
          waiting ? (
            <AppText variant="small" weight="bold" tone="trust">
              Sent. Waiting for a reviewer.
            </AppText>
          ) : (
            <Button
              label={declined ? 'Try again' : 'Start the selfie'}
              size="md"
              variant={hasPhoto ? 'primary' : 'secondary'}
              disabled={!hasPhoto}
              onPress={() => router.push('/settings/verification')}
            />
          ),
        )}
        {waiting ? <Button label="Check again" variant="secondary" onPress={load} loading={checking} /> : null}
      </ScrollView>
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </View>
  );
}
