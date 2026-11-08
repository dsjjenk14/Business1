import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { MusicPicker } from '@/components/music/MusicPicker';
import { InterestsPicker } from '@/components/profile/InterestsPicker';
import { PromptsEditor } from '@/components/profile/PromptsEditor';
import { AppText, Avatar, Button, Chip, Screen, TextField, useToast } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { setProfileSong, type Song } from '@/features/music/api';
import { setProfilePrompts } from '@/features/profiles/api';
import type { ProfilePrompt } from '@/features/profiles/prompts';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

/** Edit your photo, name, headline, bio, pronouns, area, interests, and whether your age shows. */
export default function EditProfile() {
  const { profile } = useAuth();
  // Wait for the profile before building the form, so the boxes start filled in.
  if (!profile) return <BackHeader title="Edit profile" />;
  return <EditProfileForm key={profile.id} profile={profile} />;
}

function EditProfileForm({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const { cities } = useAppConfig();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [mood, setMood] = useState(profile?.mood ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '');
  const [neighborhood, setNeighborhood] = useState(profile?.neighborhood ?? '');
  const [cityId, setCityId] = useState<number | null>(profile?.city_id ?? null);
  const [showAge, setShowAge] = useState(profile?.show_age ?? true);
  const [showArea, setShowArea] = useState(profile?.show_area ?? true);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [song, setSong] = useState<Song | null>((profile?.song as Song | null) ?? null);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>((profile?.prompts as ProfilePrompt[] | null) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          mood: mood.trim() || null,
          bio: bio.trim(),
          pronouns: pronouns.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city_id: cityId,
          show_age: showAge,
          show_area: showArea,
          interests,
        })
        .eq('id', profile.id);
      if (e) throw e;
      if ((song?.track_id ?? null) !== ((profile.song as Song | null)?.track_id ?? null)) await setProfileSong(song);
      const answered = prompts.map((p) => ({ key: p.key, answer: p.answer.trim() })).filter((p) => p.answer);
      if (JSON.stringify(answered) !== JSON.stringify(profile.prompts ?? [])) await setProfilePrompts(answered);
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
          <Avatar name={displayName || 'You'} uri={profile.avatar_url} size={96} userId={profile.id} />
          <AppText variant="small" weight="bold" tone="primary">
            Change photos (up to 3)
          </AppText>
        </Pressable>

        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} hint="How your name shows around the app, e.g. “Alex R.”" />
        <TextField label="Headline" optional value={headline} onChangeText={setHeadline} maxLength={80} placeholder="Howard Alum · Fairfax, VA" />
        <TextField label="Mood" optional value={mood} onChangeText={setMood} maxLength={60} placeholder="ready for the weekend" />
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
              <Chip key={c.id} label={c.name} selected={cityId === c.id} onPress={() => setCityId(cityId === c.id ? null : c.id)} />
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Show my area on my profile</AppText>
            <AppText variant="small" tone="muted">
              Your neighborhood and city. Off: nobody sees them on your profile. Your city still picks what&apos;s near you. Tap a city again to clear it.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Show my area on my profile"
            value={showArea}
            onValueChange={setShowArea}
            trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
          />
        </View>

        <InterestsPicker value={interests} onChange={setInterests} />

        <PromptsEditor value={prompts} onChange={setPrompts} />

        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">Your song</AppText>
          <AppText variant="small" tone="muted">
            The song that says you. It plays a 30-second preview on your profile.
          </AppText>
          <MusicPicker value={song} onChange={setSong} />
        </View>

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
