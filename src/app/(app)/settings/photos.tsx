import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Screen, useToast } from '@/components/ui';
import { refreshPersonInfo } from '@/features/people/status';
import { cancelPendingPhotos, fetchPendingPhotos, MAX_PROFILE_PHOTOS, saveProfilePhotos, uploadProfilePhoto } from '@/features/profiles/photos';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Your profile photos: up to 3. The first is your main photo; with more than
 * one, your photo changes on its own every 25 seconds wherever it shows.
 */
export default function ProfilePhotos() {
  const t = useTheme();
  const toast = useToast();
  const { profile, refreshProfile } = useAuth();
  const [photos, setPhotos] = useState<string[]>(() =>
    profile?.photo_urls?.length ? profile.photo_urls : profile?.avatar_url ? [profile.avatar_url] : [],
  );
  const [busy, setBusy] = useState<number | 'save' | null>(null);
  // After your photo check, new photos wait for a reviewer before anyone sees them.
  const [pending, setPending] = useState<string[] | null>(null);
  const userId = profile?.id;
  useFocusEffect(
    useCallback(() => {
      if (userId)
        fetchPendingPhotos(userId)
          .then(setPending)
          .catch(() => undefined);
    }, [userId]),
  );

  if (!profile) return <BackHeader title="Your photos" />;
  const me = profile.id;
  const verified = !!profile.photo_verified_at;
  // Edit the set you're waiting on, if there is one.
  const shown = pending ?? photos;

  /** Returns true when the new set is waiting for a reviewer. */
  async function save(next: string[]) {
    const before = photos;
    if (!pending) setPhotos(next);
    setBusy('save');
    try {
      const saved = await saveProfilePhotos(next);
      setPhotos(saved.photos);
      setPending(saved.pending);
      await refreshProfile();
      refreshPersonInfo(me);
      return !!saved.pending;
    } catch (e) {
      setPhotos(before);
      toast(friendlyError(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function cancelPending() {
    setBusy('save');
    try {
      await cancelPendingPhotos();
      setPending(null);
      toast('Took back your new photos');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function pick(slot: number) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setBusy(slot);
    try {
      const url = await uploadProfilePhoto(me, asset.uri);
      const next = [...shown];
      next[slot] = url;
      const held = await save(next.filter(Boolean).slice(0, MAX_PROFILE_PHOTOS));
      toast(held ? 'Sent for review. It shows once a reviewer approves it.' : slot === 0 ? 'Main photo updated' : 'Photo added');
    } catch (e) {
      toast(friendlyError(e));
      setBusy(null);
    }
  }

  const remove = (i: number) => save(shown.filter((_, j) => j !== i));
  const makeMain = (i: number) => save([shown[i]!, ...shown.filter((_, j) => j !== i)]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Your photos" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <Avatar name={profile.display_name} uri={shown[0] ?? null} size={112} userId={me} />
          <AppText variant="small" tone="muted" align="center">
            {shown.length > 1
              ? `Your photo changes on its own every 25 seconds, through all ${shown.length}.`
              : 'Add up to 3 photos. With more than one, your photo changes on its own every 25 seconds.'}
          </AppText>
          <AppText variant="small" weight="bold" align="center">
            Real photos of you only. No AI-made or AI-edited photos, and no one else’s.
          </AppText>
          {verified && !pending ? (
            <AppText variant="small" tone="muted" align="center">
              New photos are checked against your photo check before anyone sees them.
            </AppText>
          ) : null}
        </View>

        {pending ? (
          <Card accent="sponsored" style={{ gap: t.space[2] }}>
            <AppText weight="bold">Waiting for review</AppText>
            <AppText variant="small" tone="muted">
              A reviewer is checking your new photos against your photo check, usually within a day. Until then, people still see your current
              photos. Changes you make here update what’s waiting.
            </AppText>
            {photos.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <AppText variant="caption" tone="subtle">
                  Showing now:
                </AppText>
                {photos.map((u) => (
                  <Image key={u} source={{ uri: u }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                ))}
              </View>
            ) : null}
            <Button label="Take them back" size="md" variant="secondary" onPress={cancelPending} disabled={busy !== null} />
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          {Array.from({ length: MAX_PROFILE_PHOTOS }, (_, i) => {
            const url = shown[i];
            const loading = busy === i;
            const canAdd = !url && i === shown.length;
            return (
              <View key={i} style={{ flex: 1, gap: t.space[2] }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={url ? `Replace photo ${i + 1}` : `Add photo ${i + 1}`}
                  disabled={busy !== null || (!url && !canAdd)}
                  onPress={() => pick(url ? i : shown.length)}
                  style={({ pressed }) => ({
                    aspectRatio: 1,
                    borderRadius: t.radius.lg,
                    overflow: 'hidden',
                    borderWidth: url ? (i === 0 ? 3 : 0) : t.borderWidth.regular,
                    borderStyle: url ? 'solid' : 'dashed',
                    borderColor: url ? t.colors.primary : t.colors.borderStrong,
                    backgroundColor: t.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.8 : !url && !canAdd ? 0.4 : 1,
                  })}>
                  {url ? (
                    <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="add" size={30} color={t.colors.textMuted} />
                  )}
                  {loading ? (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  ) : null}
                  {url && i === 0 ? (
                    <View style={{ position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.colors.primary }}>
                      <AppText variant="caption" weight="bold" style={{ color: t.colors.onPrimary }}>
                        Main
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
                {url ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.space[3] }}>
                    {i > 0 ? (
                      <AppText variant="caption" weight="bold" tone="primary" accessibilityRole="button" onPress={() => busy === null && makeMain(i)}>
                        Set main
                      </AppText>
                    ) : null}
                    <AppText variant="caption" tone="muted" accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => busy === null && remove(i)}>
                      Remove
                    </AppText>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {shown.length < MAX_PROFILE_PHOTOS ? (
          <Button label={shown.length ? 'Add another photo' : 'Add a photo'} onPress={() => pick(shown.length)} loading={busy === 'save'} disabled={busy !== null} />
        ) : null}
      </Screen>
    </View>
  );
}
