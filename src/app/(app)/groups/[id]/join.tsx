import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Chip, Screen, TextField, useToast } from '@/components/ui';
import { HOW_FOUND, fetchGroup, requestToJoin, type GroupDetail } from '@/features/groups/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Request to join a group: why, how you found it, and who you know there. Then a confirmation. */
export default function JoinGroup() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [why, setWhy] = useState('');
  const [how, setHow] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetchGroup(Number(id))
      .then(setGroup)
      .catch(() => setGroup(null));
  }, [id]);

  const known = (group?.members ?? []).filter((m) => m.in_circle);

  async function submit() {
    if (!group) return;
    setBusy(true);
    try {
      await requestToJoin(group.id, why, how);
      setSent(true);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent && group) {
    const friend = known[0];
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Request Sent" />
        <Screen contentGap={t.space[5]}>
          <View style={{ alignItems: 'center', gap: t.space[2] }}>
            <AppText style={{ fontSize: 48 }}>📬</AppText>
            <AppText variant="h2" align="center" accessibilityRole="header">
              Request Sent!
            </AppText>
            <AppText tone="muted" align="center">
              {group.owner.display_name} will review your request. You&apos;ll get a notification when they respond.
            </AppText>
          </View>
          {friend ? (
            <Card accent="trust">
              <View style={{ gap: t.space[2] }}>
                <AppText weight="bold">While you wait</AppText>
                <AppText variant="small" tone="muted">
                  {friend.display_name} is in this group. Groups tend to accept people their members know well, so a vouch from them can help.
                </AppText>
                <Button
                  label={`See ${friend.display_name.split(' ')[0]}'s profile →`}
                  size="md"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/people/[id]', params: { id: friend.id } })}
                />
              </View>
            </Card>
          ) : null}
          <Button label="Back to group" variant="secondary" onPress={() => router.back()} />
        </Screen>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Request to Join" />
      <Screen contentGap={t.space[5]}>
        {group ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <AppText style={{ fontSize: 32 }}>{group.emoji}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">{group.name}</AppText>
                  <AppText variant="small" tone="muted">
                    {group.member_count} members · Run by {group.owner.display_name}
                  </AppText>
                </View>
              </View>
              {group.description ? (
                <AppText variant="small" tone="muted" style={{ marginTop: t.space[2] }}>
                  {group.description}
                </AppText>
              ) : null}
            </Card>

            {known.length ? (
              <View style={{ gap: t.space[2] }}>
                <AppText variant="label" tone="subtle">
                  People you know in this group
                </AppText>
                {known.map((m) => (
                  <PersonRow key={m.id} id={m.id} name={m.display_name} emoji={m.avatar_emoji} avatarUrl={m.avatar_url} vouches={m.vouch_count} ring="trust" detail="1st degree" />
                ))}
              </View>
            ) : null}

            <TextField label="Why do you want to join?" value={why} onChangeText={setWhy} maxLength={500} multiline placeholder="A sentence or two is plenty." />

            <View style={{ gap: t.space[2] }}>
              <AppText variant="small" weight="medium" tone="muted">
                How did you find this group?
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {HOW_FOUND.map((h) => (
                  <Chip key={h.key} label={h.key === 'through_member' && known[0] ? `Through ${known[0].display_name.split(' ')[0]}` : h.label} selected={how === h.key} onPress={() => setHow(h.key)} />
                ))}
              </View>
            </View>

            <Button label="Send Join Request" onPress={submit} loading={busy} disabled={!why.trim()} />
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <AppText tone="subtle" align="center">
            Loading…
          </AppText>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
