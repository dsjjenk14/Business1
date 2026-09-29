import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { InterestsPicker } from '@/components/profile/InterestsPicker';
import { AppText, Avatar, Button, Chip, Screen, TextField, useToast } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

/** Edit your photo, name, headline, bio, pronouns, area, interests, and whether your age shows. */
export default function EditProfile() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile, refreshProfile } = useAuth();
  const { cities } = useAppConfig();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '');
  const [neighborhood, setNeighborhood] = useState(profile?.neighborhood ?? '');
  const [cityId, setCityId] = useState<number | null>(profile?.city_id ?? null);
  const [showAge, setShowAge] = useState(profile?.show_age ?? true);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return <BackHeader title="Edit profile" />;

  async function save() {
    if (!profile) return;
    if (!displayName.trim()) {
      setError('Your display name can’t be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          headline: headline.trim(),
          bio: bio.trim(),
          pronouns: pronouns.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city_id: cityId,
          show_age: showAge,
          interests,
        })
        .eq('id', profile.id);
      if (e) throw e;
      await refreshProfile();
      toast('Profile saved');
      goBackOr(router, '/profile');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Edit profile" />
      <Screen contentGap={t.space[5]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change your profile photos" onPress={() => router.push('/settings/photos')} style={{ alignItems: 'center', gap: t.space[2] }}>
          <Avatar name={displayName || 'You'} uri={profile.avatar_url} size={96} ring="primary" userId={profile.id} />
          <AppText variant="small" weight="bold" tone="primary">
            Change photos (up to 3)
          </AppText>
        </Pressable>

        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} hint="How your name shows around the app, e.g. “Alex R.”" />
        <TextField label="Headline" optional value={headline} onChangeText={setHeadline} maxLength={80} placeholder="Howard Alum · Fairfax, VA" />
        <TextField
          label="About you"
          optional
          value={bio}
          onChangeText={setBio}
          maxLength={500}
          multiline
          style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }}
          hint={`${bio.length}/500`}
        />
        <TextField label="Pronouns" optional value={pronouns} onChangeText={setPronouns} maxLength={30} placeholder="She/Her" />
        <TextField label="Neighborhood" optional value={neighborhood} onChangeText={setNeighborhood} maxLength={60} placeholder="Logan Circle" />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            City
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {cities.map((c) => (
              <Chip key={c.id} label={c.name} selected={cityId === c.id} onPress={() => setCityId(c.id)} />
            ))}
          </View>
        </View>

        <InterestsPicker value={interests} onChange={setInterests} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Show my age</AppText>
            <AppText variant="small" tone="muted">
              Your birthday itself is never shown.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Show my age on my profile"
            value={showAge}
            onValueChange={setShowAge}
            trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
          />
        </View>

        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Save" onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
