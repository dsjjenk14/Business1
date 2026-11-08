import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText, Button, Card, Chip, LoadingList, Skeleton, TextField, useToast } from '@/components/ui';
import { fetchVerifications, reviewVerification, signedSelfie, type AdminVerification } from '@/features/admin/api';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const AI_NOTE = 'One or more of your profile photos looks AI-made or AI-edited. Profile photos must be real photos of you. Replace it, then do the photo check again.';

const CHECKS = [
  'They’re doing the gesture asked for.',
  'It’s the same person in the selfie and in every profile photo.',
  'It’s a live photo: not a photo of a screen or a printed picture.',
  'No profile photo is AI-made or AI-edited. Look for warped hands, ears or jewelry, melted or blurry backgrounds, skin that’s too smooth, mismatched earrings, and garbled text or logos.',
  'When in doubt, decline. They can try again, and the note tells them why.',
];

/** Photo checks waiting for review: the live selfie next to every profile photo. Admins and photo reviewers. */
export function PhotoChecks({ onChange }: { onChange?: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<AdminVerification[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchVerifications()
      .then(async (r) => {
        setRows(r);
        const entries = await Promise.all(r.map(async (x) => [x.id, x.selfie_path ? await signedSelfie(x.selfie_path) : null] as const));
        setUrls(Object.fromEntries(entries.filter((e) => e[1]).map(([k, v]) => [k, v as string])));
      })
      .catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  async function review(r: AdminVerification, approve: boolean) {
    setBusy(true);
    try {
      await reviewVerification(r.id, approve, approve ? undefined : notes[r.id] || 'The selfie didn’t match your profile photos, or the gesture wasn’t clear.');
      toast(approve ? 'Approved' : 'Declined');
      load();
      onChange?.();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: t.space[3] }}>
      <Card>
        <AppText weight="bold">Approve only if all of these are true</AppText>
        {CHECKS.map((c) => (
          <AppText key={c} variant="small" tone="muted">
            {'• '}
            {c}
          </AppText>
        ))}
      </Card>
      {rows === null ? <LoadingList rows={2} /> : rows.length === 0 ? <AppText tone="muted">No photo checks waiting.</AppText> : null}
      {(rows ?? []).map((r) => {
        const photos = [r.avatar_url, ...(r.photo_urls ?? [])].filter((u, i, all): u is string => !!u && all.indexOf(u) === i);
        return (
          <Card key={r.id}>
            <View style={{ gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                <AppText weight="bold" style={{ flex: 1 }}>
                  {r.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {r.submitted_at ? timeAgo(r.submitted_at) : ''}
                </AppText>
              </View>
              <AppText variant="small" tone="ai">
                Asked to: {r.gesture}
              </AppText>
              {r.from_browser ? (
                <AppText variant="small" weight="bold" tone="sponsored">
                  Sent from a web browser, where a saved photo can be picked instead of the camera. Check the gesture closely.
                </AppText>
              ) : null}
              <View style={{ gap: 4 }}>
                <AppText variant="caption" tone="subtle">
                  Live selfie
                </AppText>
                {urls[r.id] ? (
                  <Image source={{ uri: urls[r.id] }} style={{ width: '70%', aspectRatio: 0.8, borderRadius: t.radius.md }} contentFit="cover" />
                ) : (
                  <Skeleton height={220} radius={t.radius.md} />
                )}
              </View>
              <View style={{ gap: 4 }}>
                <AppText variant="caption" tone="subtle">
                  Profile photos ({photos.length})
                </AppText>
                {photos.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
                    {photos.map((u) => (
                      <Image key={u} source={{ uri: u }} style={{ width: 120, aspectRatio: 0.8, borderRadius: t.radius.md }} contentFit="cover" />
                    ))}
                  </ScrollView>
                ) : (
                  <AppText variant="caption" tone="sponsored">
                    No profile photos. Decline and ask them to add one.
                  </AppText>
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                <Chip label="Looks AI-made" selected={notes[r.id] === AI_NOTE} onPress={() => setNotes((n) => ({ ...n, [r.id]: n[r.id] === AI_NOTE ? '' : AI_NOTE }))} />
              </View>
              <TextField
                label="Note if declining"
                optional
                value={notes[r.id] ?? ''}
                onChangeText={(v) => setNotes((n) => ({ ...n, [r.id]: v }))}
                maxLength={200}
              />
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button label="Approve" size="md" variant="trust" style={{ flex: 1 }} onPress={() => review(r, true)} disabled={busy} />
                <Button label="Decline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => review(r, false)} disabled={busy} />
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
