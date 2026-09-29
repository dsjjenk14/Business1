import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { ProfileView } from '@/components/profile/ProfileView';
import { AppText, Button, Card, LoadingDetail, Screen, Section } from '@/components/ui';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Your own profile (opened from the header avatar). */
export default function MyProfile() {
  const t = useTheme();
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const userId = session?.user.id;
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [pins, setPins] = useState<FeedPin[]>([]);
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      Promise.all([
        fetchProfileCard(userId),
        fetchFeed({ mode: 'author', author: userId, limit: 10 }),
        supabase.from('profile_private').select('phone_verified_at').eq('id', userId).maybeSingle(),
      ]).then(([c, p, priv]) => {
        if (cancelled) return;
        setCard(c);
        setPins(p);
        setPhoneVerified(!!priv.data?.phone_verified_at);
      });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  return (
    <>
      <BackHeader title="Profile" />
      <Screen>
        {card ? (
          <ProfileView
            card={card}
            pins={pins}
            onPinChange={(n) => setPins((l) => l.map((p) => (p.id === n.id ? n : p)))}
            actions={
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button label="Edit profile" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/settings/profile')} />
                <Button label="+ New Pin" size="md" style={{ flex: 1 }} onPress={() => router.push('/pins/new')} />
              </View>
            }>
            {phoneVerified === false ? (
              <Card accent="primary" onPress={() => router.push('/verify-phone')} accessibilityLabel="Verify your phone number">
                <AppText weight="bold">Verify your phone number</AppText>
                <AppText variant="small" tone="muted">
                  Takes 30 seconds. Verified numbers make your account more trusted.
                </AppText>
              </Card>
            ) : null}

            {profile ? (
              <Section title="Your invite code">
                <AppText variant="number" style={{ letterSpacing: 4 }} selectable>
                  {profile.invite_code}
                </AppText>
                <AppText variant="small" tone="muted">
                  When someone joins with your code, you become each other&apos;s Insiders and you both get a vouch.
                </AppText>
                <Button
                  label="Share invite"
                  variant="secondary"
                  size="md"
                  onPress={() =>
                    Share.share({ message: `Join me on I'm In, where trust is earned in real life. Use my invite code ${profile.invite_code} when you sign up.` })
                  }
                />
              </Section>
            ) : null}

            <View style={{ gap: t.space[2] }}>
              <Button label="Bookmarks" variant="secondary" onPress={() => router.push('/pins/bookmarks')} />
              <Button label="Settings" variant="secondary" onPress={() => router.push('/settings')} />
              <Button label="Sign Out" variant="ghost" onPress={signOut} />
            </View>
          </ProfileView>
        ) : (
          <LoadingDetail />
        )}
      </Screen>
    </>
  );
}
