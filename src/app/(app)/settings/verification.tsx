import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Button, Card, GlyphTile, GlyphTitle, Screen, Section, useToast, type GlyphName } from '@/components/ui';
import { fetchMyVerification, startPhotoCheck, submitPhotoCheck, type MyVerification } from '@/features/verification/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Verification: phone, photo (a live selfie reviewed by a person), and ID and
 * background checks (these need a paid partner and aren't connected yet).
 */
export default function Verification() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [v, setV] = useState<MyVerification | null>(null);
  const [challenge, setChallenge] = useState<{ request_id: number; gesture: string } | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchMyVerification()
      .then(setV)
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);

  async function begin() {
    setBusy(true);
    try {
      setChallenge(await startPhotoCheck());
      setSelfie(null);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function takeSelfie() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast('Camera access is needed for the photo check.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.7 });
    if (!result.canceled) setSelfie(result.assets[0]?.uri ?? null);
  }

  async function submit() {
    if (!me || !challenge || !selfie) return;
    setBusy(true);
    try {
      await submitPhotoCheck(me, challenge.request_id, selfie);
      setChallenge(null);
      setSelfie(null);
      toast('Sent. A person will review it, usually within a day.');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const row = (glyph: GlyphName, title: string, body: string, right: React.ReactNode) => (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <GlyphTile name={glyph} size={44} tone="ai" />
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{title}</AppText>
          <AppText variant="small" tone="muted">
            {body}
          </AppText>
        </View>
        {right}
      </View>
    </Card>
  );

  const photoStatus = v?.photo_verified_at ? 'verified' : v?.photo_request?.status === 'pending' ? 'pending' : v?.photo_request?.status === 'declined' ? 'declined' : 'none';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Verification" />
      <Screen contentGap={t.space[4]}>
        <AppText tone="muted">Verification builds trust. Verified members get a check on their profile, and some features need it (like creating a group).</AppText>

        {row(
          'phone',
          'Phone number',
          v?.phone_verified ? 'Verified' : 'Confirm your number with a text code.',
          v?.phone_verified ? <Badge label="Verified" glyph="check" tone="trust" /> : <Button label="Verify" size="md" onPress={() => router.push('/verify-phone')} />,
        )}

        <Section title="Photo verification">
          {photoStatus === 'verified' ? (
            <GlyphTitle glyph="check" tone="trust">
              You&apos;re photo verified
            </GlyphTitle>
          ) : photoStatus === 'pending' ? (
            <Card>
              <GlyphTitle glyph="clock" tone="ai">
                Being reviewed
              </GlyphTitle>
              <AppText variant="small" tone="muted">
                A person is comparing your selfie with your profile photos. You&apos;ll get a notification.
              </AppText>
            </Card>
          ) : challenge ? (
            <Card accent="ai">
              <View style={{ gap: t.space[3] }}>
                <AppText weight="bold">Take a selfie doing this:</AppText>
                <AppText variant="h3" tone="ai">
                  {challenge.gesture}
                </AppText>
                <AppText variant="small" tone="muted">
                  Face the camera in good light. The gesture proves it&apos;s a live photo of you. Only reviewers see it.
                </AppText>
                {selfie ? (
                  <Image source={{ uri: selfie }} style={{ width: 160, height: 200, borderRadius: t.radius.md, alignSelf: 'center' }} contentFit="cover" />
                ) : null}
                <Button label={selfie ? 'Retake' : 'Open camera'} variant="secondary" onPress={takeSelfie} disabled={busy} />
                <Button label="Send for review" onPress={submit} loading={busy} disabled={!selfie} />
              </View>
            </Card>
          ) : (
            <Card>
              <View style={{ gap: t.space[2] }}>
                {photoStatus === 'declined' ? (
                  <AppText variant="small" tone="sponsored">
                    Last try wasn&apos;t approved{v?.photo_request?.review_note ? `: ${v.photo_request.review_note}` : '.'} Give it another go.
                  </AppText>
                ) : null}
                <AppText variant="small" tone="muted">
                  Take a quick selfie doing a random gesture. A person checks it matches your profile photos. Your profile needs a photo of you
                  first.
                </AppText>
                <Button label="Start photo check" onPress={begin} loading={busy} />
              </View>
            </Card>
          )}
        </Section>

        <Section title="More checks">
          {row('key', 'ID verification', 'Confirm your identity with a government ID.', <Badge label="Coming soon" tone="neutral" />)}
          {row('shield', 'Background check', 'An optional safety check for extra trust.', <Badge label="Coming soon" tone="neutral" />)}
          <AppText variant="caption" tone="subtle">
            ID and background checks use a specialized partner and will be added before launch.
          </AppText>
        </Section>
      </Screen>
    </View>
  );
}
