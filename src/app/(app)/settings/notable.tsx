import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Chip, LoadingList, Screen, Segmented, Sheet, SpecialSticker, TextField, useToast } from '@/components/ui';
import { fetchCircle, type CircleOverview } from '@/features/circles/api';
import { fetchMyNotable, requestNotable, saveNotableSettings, setNotablePick, type MyNotable } from '@/features/notable/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Notable: ask for the badge (verified public figures), or, once in, the extra privacy settings. */
export default function Notable() {
  const t = useTheme();
  const toast = useToast();
  const [me, setMe] = useState<MyNotable | null>(null);
  const load = useCallback(() => {
    fetchMyNotable()
      .then(setMe)
      .catch((e) => toast(friendlyError(e)));
  }, [toast]);
  useFocusEffect(load);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title={me?.notable ? 'Notable settings' : 'Notable'} />
      <Screen>{!me ? <LoadingList rows={3} /> : me.notable ? <Settings me={me} reload={load} /> : <Ask me={me} reload={load} />}</Screen>
    </KeyboardAvoidingView>
  );
}

/** Ask to join: selfie check, a code in an official account's bio, and an optional manager. */
function Ask({ me, reload }: { me: MyNotable; reload: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [manager, setManager] = useState('');
  const [busy, setBusy] = useState(false);
  const open = me.request?.status === 'open';

  async function send() {
    setBusy(true);
    try {
      await requestNotable(url, manager);
      toast('Sent. We’ll let you know.');
      reload();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ alignItems: 'center', gap: t.space[2] }}>
        <SpecialSticker label="Notable" />
        <AppText variant="h2" align="center" accessibilityRole="header">
          Are you a public figure?
        </AppText>
        <AppText tone="muted" align="center">
          Musicians, athletes, creators, chefs, local personalities. We check it’s really you, then add the Notable badge and turn on extra privacy.
        </AppText>
      </View>
      {open ? (
        <Card accent="ai">
          <AppText weight="bold">We’re reviewing your request</AppText>
          <AppText variant="small" tone="muted">
            Keep {me.code} in the bio of {me.request?.official_url} until we’re done. We’ll let you know.
          </AppText>
        </Card>
      ) : (
        <>
          {me.request?.status === 'declined' ? (
            <AppText variant="small" tone="muted">
              We couldn’t confirm your last request. You can try again with more details.
            </AppText>
          ) : null}
          <Card style={{ gap: t.space[2] }}>
            <AppText weight="bold">1. Do the selfie check</AppText>
            <AppText variant="small" tone="muted">
              A quick live selfie, reviewed by a person.
            </AppText>
            {me.verified ? (
              <AppText variant="small" weight="bold" tone="trust">
                Done
              </AppText>
            ) : (
              <Button label="Do the selfie check" size="md" variant="secondary" onPress={() => router.push('/settings/verification')} />
            )}
          </Card>
          <Card style={{ gap: t.space[2] }}>
            <AppText weight="bold">2. Prove an official account is yours</AppText>
            <AppText variant="small" tone="muted">
              Put this code in your Instagram, TikTok or website bio until we approve you:
            </AppText>
            <AppText variant="h2" selectable style={{ letterSpacing: 2 }}>
              {me.code}
            </AppText>
            <TextField label="Link to that account" placeholder="instagram.com/yourname" value={url} onChangeText={setUrl} autoCapitalize="none" maxLength={300} />
          </Card>
          <Card style={{ gap: t.space[2] }}>
            <AppText weight="bold">3. Manager or agent</AppText>
            <TextField label="Name and email or phone" optional hint="We’ll only use it to confirm." value={manager} onChangeText={setManager} maxLength={200} />
          </Card>
          <Button label="Send for review" onPress={send} loading={busy} disabled={!me.verified || url.trim().length < 8} />
        </>
      )}
    </>
  );
}

/** Their safety settings. They start at the safest choice when the badge is approved. */
function Settings({ me, reload }: { me: MyNotable; reload: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [s, setS] = useState(me);
  const [picking, setPicking] = useState(false);
  const [insiders, setInsiders] = useState<CircleOverview['first'] | null>(null);

  async function save(patch: Partial<MyNotable>) {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await saveNotableSettings(next);
    } catch (e) {
      setS(s);
      toast(friendlyError(e));
    }
  }

  async function pick(id: string, on: boolean) {
    try {
      await setNotablePick(id, on);
      reload();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  function openPicker() {
    setPicking(true);
    if (!insiders)
      fetchCircle()
        .then((c) => setInsiders(c.first))
        .catch(() => setInsiders([]));
  }

  const toggle = (label: string, detail: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{label}</AppText>
        <AppText variant="small" tone="muted">
          {detail}
        </AppText>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }} />
    </View>
  );

  const picked = new Set(me.picks.map((p) => p.id));
  return (
    <>
      <Card accent="primary">
        <AppText variant="small">Because you’re Notable, these start at the safest setting. You can change them any time.</AppText>
      </Card>

      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Show where I am</AppText>
        <Segmented
          value={s.location}
          onChange={(location) => save({ location })}
          options={[
            { key: 'never', label: 'Never' },
            { key: 'after', label: 'After I leave' },
            { key: 'live', label: 'Right away' },
          ]}
        />
        <AppText variant="small" tone="muted">
          {s.location === 'after'
            ? '“After I leave” shows the place only once you’ve gone, for 3 days.'
            : s.location === 'never'
              ? 'Nobody sees where you go, except the people you pick.'
              : 'Your plans show like any member’s. People you pick always see them.'}
        </AppText>
      </View>

      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Who can message me</AppText>
        <Segmented
          value={s.messages}
          onChange={(messages) => save({ messages })}
          options={[
            { key: 'picked', label: 'People I pick' },
            { key: 'insiders', label: 'My Insiders' },
          ]}
        />
      </View>

      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Who can reply to my posts</AppText>
        <Segmented
          value={s.replies}
          onChange={(replies) => save({ replies })}
          options={[
            { key: 'picked', label: 'People I pick' },
            { key: 'insiders', label: 'Insiders' },
            { key: 'everyone', label: 'Everyone' },
          ]}
        />
      </View>

      {toggle('Intro requests', s.intro_requests ? 'On: people can ask a friend to introduce them.' : 'Off: nobody can ask a friend to introduce them.', s.intro_requests, (intro_requests) => save({ intro_requests }))}
      {toggle('Arrival alerts', s.arrivals ? 'On: people who can see your plans see when you arrive.' : 'Off: your arrival is never announced.', s.arrivals, (arrivals) => save({ arrivals }))}
      {toggle('Show my vouch count', 'You’re listed under Notable, not in “Most vouched”.', s.show_vouch_count, (show_vouch_count) => save({ show_vouch_count }))}

      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">People I pick</AppText>
        <AppText variant="small" tone="muted">
          They always see where you are, and can message you and reply. Pick from your Insiders.
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {me.picks.map((p) => (
            <Chip key={p.id} label={`${p.display_name}  ×`} selected onPress={() => pick(p.id, false)} />
          ))}
          <Chip label="+ Add" onPress={openPicker} />
        </View>
      </View>

      <Sheet visible={picking} title="Pick from your Insiders" onClose={() => setPicking(false)}>
        {!insiders ? <LoadingList rows={2} /> : null}
        {insiders?.length === 0 ? <AppText tone="muted">Your Insiders show up here.</AppText> : null}
        <ScrollView style={{ maxHeight: 420 }}>
          {insiders
            ?.filter((p) => !picked.has(p.id))
            .map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${p.display_name}`}
                onPress={() => {
                  pick(p.id, true);
                  setPicking(false);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], paddingVertical: t.space[2] }}>
                <Avatar name={p.display_name} uri={p.avatar_url} size={40} userId={p.id} />
                <AppText weight="bold">{p.display_name}</AppText>
              </Pressable>
            ))}
        </ScrollView>
      </Sheet>
    </>
  );
}
