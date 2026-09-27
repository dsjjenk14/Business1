import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Badge, Button, Card, Screen, Section } from '@/components/ui';
import { tierProgress, useAppConfig } from '@/config/useAppConfig';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Your own profile (opened from the header avatar). Full profile arrives in Phase 2. */
export default function MyProfile() {
  const t = useTheme();
  const router = useRouter();
  const { profile, session, signOut } = useAuth();
  const { tiers } = useAppConfig();
  const [stats, setStats] = useState({ circle: 0, groups: 0 });
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.rpc('first_degree_ids', { p_user: userId }),
      supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('profile_private').select('phone_verified_at').eq('id', userId).maybeSingle(),
    ]).then(([circle, groups, priv]) => {
      setStats({ circle: circle.data?.length ?? 0, groups: groups.count ?? 0 });
      setPhoneVerified(!!priv.data?.phone_verified_at);
    });
  }, [userId]);

  if (!profile) return <BackHeader title="Profile" />;
  const { current } = tierProgress(profile.vouch_count, tiers);

  return (
    <>
      <BackHeader title="Profile" />
      <Screen>
        <View style={{ alignItems: 'center', gap: t.space[3] }}>
          <Avatar name={profile.display_name} uri={profile.avatar_url} emoji={profile.avatar_emoji} size={104} ring="primary" />
          <View style={{ alignItems: 'center', gap: t.space[1] }}>
            <AppText variant="h1" accessibilityRole="header">
              {profile.display_name}
            </AppText>
            <AppText tone="muted" align="center">
              {[profile.headline, profile.pronouns].filter(Boolean).join(' · ')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space[2] }}>
            {profile.is_founding_member ? <Badge label={`Founding Member #${profile.member_number}`} emoji="🏅" tone="sponsored" /> : null}
            {current ? <Badge label={current.name} emoji={current.emoji} tone="trust" /> : null}
            {profile.id_verified_at ? <Badge label="ID Verified" emoji="🔑" tone="ai" verified /> : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          {[
            { n: profile.vouch_count, label: 'Vouches', tone: 'trust' as const },
            { n: stats.circle, label: 'Circle', tone: 'primary' as const },
            { n: stats.groups, label: 'Groups', tone: 'ai' as const },
          ].map((s) => (
            <Card key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: t.space[3] }}>
              <AppText variant="number" tone={s.tone}>
                {s.n}
              </AppText>
              <AppText variant="label" tone="subtle">
                {s.label}
              </AppText>
            </Card>
          ))}
        </View>

        {profile.bio ? (
          <Section title="About me">
            <AppText>{profile.bio}</AppText>
          </Section>
        ) : null}

        <Section title="Your invite code">
          <AppText variant="number" style={{ letterSpacing: 4 }} selectable>
            {profile.invite_code}
          </AppText>
          <AppText variant="small" tone="muted">
            When someone joins with your code, you&apos;re connected automatically and you both get a vouch.
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

        {phoneVerified === false ? (
          <Card accent="primary" onPress={() => router.push('/verify-phone')} accessibilityLabel="Verify your phone number">
            <AppText weight="bold">Verify your phone number</AppText>
            <AppText variant="small" tone="muted">
              Takes 30 seconds. Verified numbers make your account more trusted.
            </AppText>
          </Card>
        ) : null}

        <Button label="Appearance" variant="secondary" onPress={() => router.push('/settings/appearance')} />
        <Button label="Sign Out" variant="ghost" onPress={signOut} />
        <AppText variant="caption" tone="subtle" align="center">
          Your full profile (vouches, badges, pins) arrives in Phase 2.
        </AppText>
      </Screen>
    </>
  );
}
