import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Screen, useToast } from '@/components/ui';
import { refreshPersonInfo } from '@/features/people/status';
import { MAX_PROFILE_PHOTOS, saveProfilePhotos, uploadProfilePhoto } from '@/features/profiles/photos';
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

  if (!profile) return <BackHeader title="Your photos" />;
  const me = profile.id;

  async function save(next: string[]) {
    const before = photos;
    setPhotos(next);
    setBusy('save');
    try {
      await saveProfilePhotos(next);
      await refreshProfile();
      refreshPersonInfo(me);
    } catch (e) {
      setPhotos(before);
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
      const next = [...photos];
      next[slot] = url;
      await save(next.filter(Boolean).slice(0, MAX_PROFILE_PHOTOS));
      toast(slot === 0 ? 'Main photo updated' : 'Photo added');
    } catch (e) {
      toast(friendlyError(e));
      setBusy(null);
    }
  }

  const remove = (i: number) => save(photos.filter((_, j) => j !== i));
  const makeMain = (i: number) => save([photos[i]!, ...photos.filter((_, j) => j !== i)]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Your photos" />
      <Screen contentGap={t.space[5]}>
        <View style={{ alignItems: 'center', gap: t.space[2] }}>
          <Avatar name={profile.display_name} uri={photos[0] ?? null} size={112} userId={me} />
          <AppText variant="small" tone="muted" align="center">
            {photos.length > 1
              ? `Your photo changes on its own every 25 seconds, through all ${photos.length}.`
              : 'Add up to 3 photos. With more than one, your photo changes on its own every 25 seconds.'}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          {Array.from({ length: MAX_PROFILE_PHOTOS }, (_, i) => {
            const url = photos[i];
            const loading = busy === i;
            const canAdd = !url && i === photos.length;
            return (
              <View key={i} style={{ flex: 1, gap: t.space[2] }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={url ? `Replace photo ${i + 1}` : `Add photo ${i + 1}`}
                  disabled={busy !== null || (!url && !canAdd)}
                  onPress={() => pick(url ? i : photos.length)}
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

        {photos.length < MAX_PROFILE_PHOTOS ? (
          <Button label={photos.length ? 'Add another photo' : 'Add a photo'} onPress={() => pick(photos.length)} loading={busy === 'save'} disabled={busy !== null} />
        ) : null}
      </Screen>
    </View>
  );
}
