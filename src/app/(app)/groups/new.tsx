import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Chip, Screen, TextField, useToast } from '@/components/ui';
import { fetchCircle, type CircleOverview } from '@/features/circles/api';
import { GROUP_CATEGORIES, createGroup, type GroupCategory } from '@/features/groups/api';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Create a group: name, category, description, how people join, and founding members from your circle. */
export default function NewGroup() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory | null>(null);
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('');
  const [joinType, setJoinType] = useState<'request' | 'open'>('request');
  const [invite, setInvite] = useState<string[]>([]);
  const [circle, setCircle] = useState<CircleOverview['first']>([]);
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    fetchCircle()
      .then((c) => setCircle(c.first))
      .catch(() => undefined);
    supabase
      .from('profile_private')
      .select('phone_verified_at')
      .eq('id', me)
      .maybeSingle()
      .then(({ data }) => setPhoneVerified(!!data?.phone_verified_at));
  }, [me]);

  async function submit() {
    if (!category) return;
    setBusy(true);
    try {
      const id = await createGroup({
        name,
        category,
        description,
        joinType,
        schedule,
        emoji: GROUP_CATEGORIES.find((c) => c.key === category)?.emoji,
        invite,
      });
      toast(invite.length ? `Group created. ${invite.length} invite${invite.length === 1 ? '' : 's'} sent.` : 'Group created');
      router.replace({ pathname: '/groups/[id]', params: { id: String(id) } });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const joinOption = (key: 'request' | 'open', icon: string, title: string, body: string) => {
    const selected = joinType === key;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title}. ${body}`}
        onPress={() => setJoinType(key)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
          padding: t.space[3],
          borderRadius: t.radius.md,
          borderWidth: t.borderWidth.regular,
          borderColor: selected ? t.colors.primary : t.colors.border,
          backgroundColor: t.colors.surface,
        }}>
        <AppText style={{ fontSize: 22 }}>{icon}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="bold">
            {title}
          </AppText>
          <AppText variant="caption" tone="muted">
            {body}
          </AppText>
        </View>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? t.colors.primary : t.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Create a Group" />
      <Screen contentGap={t.space[5]}>
        <AppText tone="muted">Groups give your network a home base. Every member is a real, verified person: no anonymous joiners.</AppText>

        {phoneVerified === false ? (
          <Card accent="primary">
            <View style={{ gap: t.space[2] }}>
              <AppText weight="bold">Verify your phone first</AppText>
              <AppText variant="small" tone="muted">
                Group owners need a verified phone number. It keeps groups trustworthy.
              </AppText>
              <Button label="Verify phone" size="md" onPress={() => router.push('/verify-phone')} />
            </View>
          </Card>
        ) : null}

        <TextField label="Group name" value={name} onChangeText={setName} maxLength={60} placeholder="DC Morning Runners" />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Category
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {GROUP_CATEGORIES.map((c) => (
              <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
            ))}
          </View>
        </View>

        <TextField label="Description" optional value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="What you do and who it's for." />
        <TextField label="When you meet" optional value={schedule} onChangeText={setSchedule} maxLength={40} placeholder="Saturdays 7 AM" />

        <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Join type
          </AppText>
          {joinOption('request', '🔒', 'Request to join', 'You approve each member. Best for trust-based groups.')}
          {joinOption('open', '🌐', 'Open to all members', 'Anyone on I’m In can join directly.')}
        </View>

        {circle.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="small" weight="medium" tone="muted">
              Invite founding members · optional
            </AppText>
            {circle.map((p) => {
              const selected = invite.includes(p.id);
              return (
                <PersonRow
                  key={p.id}
                  id={p.id}
                  name={p.display_name}
                  emoji={p.avatar_emoji}
                  avatarUrl={p.avatar_url}
                  vouches={p.vouch_count}
                  right={
                    <Chip
                      label={selected ? 'Invited' : 'Invite'}
                      selected={selected}
                      accessibilityLabel={`${selected ? 'Remove invite for' : 'Invite'} ${p.display_name}`}
                      onPress={() => setInvite((s) => (selected ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                    />
                  }
                />
              );
            })}
          </View>
        ) : null}

        <Button label="Create Group" onPress={submit} loading={busy} disabled={name.trim().length < 2 || !category || phoneVerified === false} />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
