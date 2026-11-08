import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText, Button, Card, Chip, LoadingList, Skeleton, TextField, useToast } from '@/components/ui';
import {
  fetchPendingPhotoSets,
  fetchVerifications,
  reviewPhotoSet,
  reviewVerification,
  signedSelfie,
  type AdminVerification,
  type PendingPhotoSet,
} from '@/features/admin/api';
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

const NEW_AI_NOTE = 'One or more of your new photos looks AI-made or AI-edited. Profile photos must be real photos of you.';

/** Photo checks waiting for review: the live selfie next to every profile photo. Admins and photo reviewers. */
export function PhotoChecks({ onChange }: { onChange?: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<AdminVerification[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState<PendingPhotoSet[] | null>(null);
  const [setSelfies, setSetSelfies] = useState<Record<string, string>>({});
  const [newNotes, setNewNotes] = useState<Record<string, string>>({});

  const loadSets = useCallback(() => {
    fetchPendingPhotoSets()
      .then(async (r) => {
        setSets(r);
        const entries = await Promise.all(r.map(async (x) => [x.user_id, x.selfie_path ? await signedSelfie(x.selfie_path) : null] as const));
        setSetSelfies(Object.fromEntries(entries.filter((e) => e[1]).map(([k, v]) => [k, v as string])));
      })
      .catch(() => setSets([]));
  }, []);
  useFocusEffect(loadSets);

  async function reviewSet(r: PendingPhotoSet, approve: boolean) {
    setBusy(true);
    try {
      await reviewPhotoSet(r.user_id, approve, approve ? undefined : newNotes[r.user_id] || undefined);
      toast(approve ? 'Approved. Their new photos are up.' : 'Declined');
      loadSets();
      onChange?.();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

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

      <AppText variant="h3" accessibilityRole="header" style={{ marginTop: t.space[3] }}>
        New photos
      </AppText>
      <AppText variant="small" tone="muted">
        Members who already passed their photo check and added a new photo. Nobody sees it until you approve. Approve only if it’s the same
        person as their selfie, and it’s a real photo, not AI-made or AI-edited.
      </AppText>
      {sets === null ? <LoadingList rows={1} /> : sets.length === 0 ? <AppText tone="muted">No new photos waiting.</AppText> : null}
      {(sets ?? []).map((r) => {
        const isNew = (u: string) => !(r.current_photos ?? []).includes(u);
        return (
          <Card key={r.user_id}>
            <View style={{ gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                <AppText weight="bold" style={{ flex: 1 }}>
                  {r.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {timeAgo(r.created_at)}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="caption" tone="subtle">
                    Their approved selfie
                  </AppText>
                  {setSelfies[r.user_id] ? (
                    <Image source={{ uri: setSelfies[r.user_id] }} style={{ width: '100%', aspectRatio: 0.8, borderRadius: t.radius.md }} contentFit="cover" />
                  ) : r.selfie_path ? (
                    <Skeleton height={160} radius={t.radius.md} />
                  ) : (
                    <AppText variant="caption" tone="sponsored">
                      No selfie on file. Compare with their current photos.
                    </AppText>
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="caption" tone="subtle">
                    Showing now
                  </AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {(r.current_photos ?? []).map((u) => (
                      <Image key={u} source={{ uri: u }} style={{ width: 48, height: 48, borderRadius: t.radius.sm }} contentFit="cover" />
                    ))}
                    {(r.current_photos ?? []).length === 0 ? (
                      <AppText variant="caption" tone="subtle">
                        None
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <AppText variant="caption" tone="subtle">
                  Their new set, in order (new ones are marked)
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
                  {(r.new_photos ?? []).map((u) => (
                    <View key={u}>
                      <Image
                        source={{ uri: u }}
                        style={{ width: 120, aspectRatio: 0.8, borderRadius: t.radius.md, borderWidth: isNew(u) ? 3 : 0, borderColor: t.colors.primary }}
                        contentFit="cover"
                      />
                      {isNew(u) ? (
                        <View style={{ position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.colors.primary }}>
                          <AppText variant="caption" weight="bold" style={{ color: t.colors.onPrimary }}>
                            New
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                <Chip
                  label="Looks AI-made"
                  selected={newNotes[r.user_id] === NEW_AI_NOTE}
                  onPress={() => setNewNotes((n) => ({ ...n, [r.user_id]: n[r.user_id] === NEW_AI_NOTE ? '' : NEW_AI_NOTE }))}
                />
              </View>
              <TextField
                label="Note if declining"
                optional
                value={newNotes[r.user_id] ?? ''}
                onChangeText={(v) => setNewNotes((n) => ({ ...n, [r.user_id]: v }))}
                maxLength={200}
              />
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button label="Approve" size="md" variant="trust" style={{ flex: 1 }} onPress={() => reviewSet(r, true)} disabled={busy} />
                <Button label="Decline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => reviewSet(r, false)} disabled={busy} />
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
