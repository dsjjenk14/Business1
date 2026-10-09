import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Chip, GlyphTitle, Screen, useToast } from '@/components/ui';
import { checkIn, fetchCircle, fetchMeetups, fetchVouchWords, giveVouch, vouchesLeftLabel, vouchFromContacts, type Meetup } from '@/features/circles/api';
import { canPickContacts, pickContactPhones } from '@/features/circles/contacts';
import { fetchProfileCard } from '@/features/profiles/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * Check In (records that you met), then, only if you want, vouch.
 * 1. When you're with someone, you both tap Check In. GPS confirms you're together.
 * 2. Pick them, pick one word, vouch. (2 vouches per month; within 14 days of meeting.)
 * Or, from someone's profile: if their verified number is in your contacts, vouch without a meetup.
 */
export default function Vouch() {
  const t = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ user?: string }>();
  const me = session?.user.id;

  const [meetups, setMeetups] = useState<Meetup[] | null>(null);
  const [words, setWords] = useState<{ id: number; word: string }[]>([]);
  // undefined while loading; null = unlimited (Premium).
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [selected, setSelected] = useState<number | null>(null);
  const [wordId, setWordId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkInMsg, setCheckInMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [contactWordId, setContactWordId] = useState<number | null>(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [m, w, c, card] = await Promise.all([
      fetchMeetups(),
      fetchVouchWords(),
      fetchCircle(),
      params.user ? fetchProfileCard(params.user) : Promise.resolve(null),
    ]);
    setPerson(card ? { id: card.id, name: card.display_name } : null);
    setMeetups(m);
    setWords(w);
    setLeft(c.vouches_left);
    const vouched = new Set(m.filter((x) => x.already_vouched).map((x) => x.user_id));
    const pre = params.user && !vouched.has(params.user) ? m.find((x) => x.user_id === params.user) : null;
    if (pre) setSelected(pre.encounter_id);
  }, [params.user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => toast("Couldn't load your meetups."));
    }, [refresh, toast]),
  );

  async function doCheckIn() {
    setChecking(true);
    setCheckInMsg(null);
    try {
      const recent = await checkIn();
      await refresh();
      setCheckInMsg(
        recent.length
          ? `Checked in ✓ You're with ${recent.map((r) => r.display_name).join(', ').replace(/\.$/, '')}.`
          : "Checked in ✓ Nobody else has checked in here yet. Ask the person you're with to tap Check In too.",
      );
    } catch (e) {
      setCheckInMsg(friendlyError(e));
    } finally {
      setChecking(false);
    }
  }

  const chosen = meetups?.find((m) => m.encounter_id === selected) ?? null;

  async function submit() {
    if (!me || !chosen || !wordId) return;
    setBusy(true);
    try {
      await giveVouch(me, chosen.user_id, wordId, chosen.encounter_id);
      toast(`You vouched for ${chosen.display_name}`);
      setSelected(null);
      setWordId(null);
      await refresh();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function vouchFromMyContacts() {
    if (!person || !contactWordId) return;
    setContactMsg(null);
    setContactBusy(true);
    try {
      const phones = await pickContactPhones();
      if (!phones) return;
      if (!phones.length) {
        setContactMsg("That contact doesn't have a phone number saved.");
        return;
      }
      if (await vouchFromContacts(person.id, contactWordId, phones)) {
        toast(`You vouched for ${person.name}`);
        setContactWordId(null);
        await refresh();
      } else {
        setContactMsg(`That contact's number doesn't match ${person.name.split(' ')[0]}'s verified number.`);
      }
    } catch (e) {
      setContactMsg(friendlyError(e));
    } finally {
      setContactBusy(false);
    }
  }

  // One row per person: their most recent meetup. If you already vouched for them
  // from any meetup in the last 14 days, they show under "Already vouched".
  const byPerson = new Map<string, Meetup>();
  for (const m of meetups ?? []) if (!byPerson.has(m.user_id)) byPerson.set(m.user_id, m);
  const vouchedRecently = new Set((meetups ?? []).filter((m) => m.already_vouched).map((m) => m.user_id));
  const vouchable = [...byPerson.values()].filter((m) => !vouchedRecently.has(m.user_id));
  const done = [...byPerson.values()].filter((m) => vouchedRecently.has(m.user_id));
  // From someone's profile with no meetup to vouch from: offer contacts instead.
  const offerContacts = !!person && person.id !== me && meetups !== null && !vouchable.some((m) => m.user_id === person.id) && !vouchedRecently.has(person.id);

  return (
    <>
      <BackHeader title="Check In" />
      <Screen>
        <Card accent="trust">
          <View style={{ gap: t.space[2] }}>
            <GlyphTitle glyph="pin" variant="h3">With someone right now?</GlyphTitle>
            <AppText variant="small" tone="muted">
              You both tap Check In while you&apos;re together. GPS confirms you met. That&apos;s all a check-in does: it never vouches for anyone. Your exact
              location is never shown to anyone.
            </AppText>
            <Button label={checking ? 'Checking your location…' : 'Check In'} variant="trust" onPress={doCheckIn} loading={checking} />
            {checkInMsg ? (
              <AppText variant="small" accessibilityLiveRegion="polite">
                {checkInMsg}
              </AppText>
            ) : null}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="label" tone="subtle">
            Vouch only if you&apos;d recommend them
          </AppText>
          {left !== undefined ? (
            <AppText variant="small" weight="bold" tone={left == null || left > 0 ? 'trust' : 'danger'}>
              {vouchesLeftLabel(left)}
            </AppText>
          ) : null}
        </View>

        {meetups && vouchable.length === 0 ? (
          <Card>
            <AppText variant="small" tone="muted">
              {params.user
                ? "You haven't checked in with this person yet. Next time you're together, both tap Check In, or vouch from your contacts below."
                : 'No meetups to vouch from yet. Check in the next time you go out with someone.'}
            </AppText>
          </Card>
        ) : null}

        <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
          {vouchable.map((m) => {
            const isSel = m.encounter_id === selected;
            return (
              <Pressable
                key={m.encounter_id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSel }}
                aria-checked={isSel}
                onPress={() => setSelected(m.encounter_id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[3],
                  padding: t.space[3],
                  borderRadius: t.radius.lg,
                  borderWidth: t.borderWidth.regular,
                  borderColor: isSel ? t.colors.trust : t.colors.border,
                  backgroundColor: t.colors.surface,
                }}>
                <Avatar name={m.display_name} uri={m.avatar_url} size={44} ring={isSel ? 'trust' : null} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">{m.display_name}</AppText>
                  <AppText variant="caption" tone="subtle">
                    GPS confirmed{m.place_label ? ` · ${m.place_label}` : ''} · {timeAgo(m.met_at)}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>

        {chosen ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <AppText weight="bold">One word for what it was like to spend time with {chosen.display_name.split(' ')[0]}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {words.map((w) => (
                  <Chip key={w.id} label={w.word} selected={wordId === w.id} onPress={() => setWordId(w.id)} />
                ))}
              </View>
              <Button
                label={`Vouch for ${chosen.display_name}`}
                variant="trust"
                onPress={submit}
                loading={busy}
                disabled={!wordId || left === 0}
              />
              {left === 0 ? (
                <AppText variant="caption" tone="danger">
                  You&apos;ve used your 5 vouches for this month. You get more on the 1st, or go unlimited with Premium.
                </AppText>
              ) : null}
            </View>
          </Card>
        ) : null}

        {offerContacts && person ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <GlyphTitle glyph="people" variant="h3">
                {`${person.name.split(' ')[0]} in your contacts?`}
              </GlyphTitle>
              <AppText variant="small" tone="muted">
                If their number is saved in your phone, you can vouch without checking in. Pick them from your contacts and we check that number against
                the one they verified. Only that number is checked, and your contacts are never uploaded or saved.
              </AppText>
              {canPickContacts ? (
                <>
                  <AppText weight="bold">One word for {person.name.split(' ')[0]}</AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                    {words.map((w) => (
                      <Chip key={w.id} label={w.word} selected={contactWordId === w.id} onPress={() => setContactWordId(w.id)} />
                    ))}
                  </View>
                  <Button
                    label="Pick from my contacts"
                    variant="trust"
                    onPress={vouchFromMyContacts}
                    loading={contactBusy}
                    disabled={!contactWordId || left === 0}
                  />
                </>
              ) : (
                <AppText variant="small" weight="bold">
                  Open I&apos;m In on your phone to vouch from your contacts.
                </AppText>
              )}
              {contactMsg ? (
                <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
                  {contactMsg}
                </AppText>
              ) : null}
            </View>
          </Card>
        ) : null}

        {done.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="label" tone="subtle">
              Already vouched
            </AppText>
            {done.map((m) => (
              <AppText key={m.encounter_id} variant="small" tone="muted">
                ✓ {m.display_name}
                {m.place_label ? ` · ${m.place_label}` : ''}
              </AppText>
            ))}
          </View>
        ) : null}
      </Screen>
    </>
  );
}
