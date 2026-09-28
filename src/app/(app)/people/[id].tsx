import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { ProfileView } from '@/components/profile/ProfileView';
import { AppText, Button, IconButton, LoadingDetail, OptionsSheet, Screen, useToast } from '@/components/ui';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
import { blockUser, fetchPersonPrivacy, setHiddenFrom, setMuted, type PersonPrivacy } from '@/features/safety/api';
import { fetchVouchesGiven, unvouch } from '@/features/circles/api';
import { confirmThen } from '@/lib/confirm';
import { fetchMessageStatus, openDirectChat } from '@/features/chat/api';
import { recordProfileView } from '@/features/plan/api';
import { goBackOr } from '@/lib/navigation';
import { friendlyError } from '@/lib/supabase';
import { useAppConfig } from '@/config/useAppConfig';
import { useTheme } from '@/theme';

/** Someone else's profile. */
export default function PersonProfile() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { planLimits } = useAppConfig();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<ProfileCard | null | undefined>(undefined);
  const [pins, setPins] = useState<FeedPin[]>([]);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [menu, setMenu] = useState(false);
  const [privacy, setPrivacy] = useState<PersonPrivacy | null>(null);
  const [iVouched, setIVouched] = useState(false);
  const [opening, setOpening] = useState(false);
  const [exchanges, setExchanges] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProfileCard(id), fetchFeed({ mode: 'author', author: id, limit: 10 })])
      .then(([c, p]) => {
        if (cancelled) return;
        if (c?.is_me) {
          router.replace('/profile');
          return;
        }
        setCard(c);
        setPins(p);
        fetchPersonPrivacy(id)
          .then((v) => !cancelled && setPrivacy(v))
          .catch(() => undefined);
        fetchVouchesGiven()
          .then((v) => !cancelled && setIVouched(v.some((x) => x.user_id === id)))
          .catch(() => undefined);
        if (c) recordProfileView(c.id);
        if (c && c.degree === 1 && !c.can_message) {
          fetchMessageStatus(c.id)
            .then((m) => !cancelled && setExchanges(m.exchanges))
            .catch(() => undefined);
        }
      })
      .catch(() => !cancelled && setCard(null));
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (card === null) {
    return (
      <>
        <BackHeader title="Profile" />
        <Screen>
          <AppText tone="muted" align="center">
            This profile isn&apos;t available.
          </AppText>
        </Screen>
      </>
    );
  }

  const first = card?.display_name.split(' ')[0] ?? '';
  const needed = planLimits.messaging_min_exchanges?.free ?? 5;

  const actions = card ? (
    <View style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button
          label="+ Vouch"
          variant="trust"
          size="md"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/circles/vouch', params: { user: card.id } })}
        />
        {card.degree === 1 ? (
          <Button
            label="Message"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            disabled={!card.can_message || opening}
            onPress={async () => {
              setOpening(true);
              try {
                const conv = await openDirectChat(card.id);
                router.push({ pathname: '/chat/[id]', params: { id: String(conv) } });
              } catch (e) {
                toast(friendlyError(e));
              } finally {
                setOpening(false);
              }
            }}
          />
        ) : card.degree === 2 ? (
          <Button
            label="Request Intro"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/circles/request-intro', params: { target: card.id } })}
          />
        ) : null}
      </View>
      {card.degree === 1 && !card.can_message ? (
        <AppText variant="caption" tone="subtle" align="center">
          Messaging unlocks after {needed} back-and-forths with {first} on Pins
          {exchanges != null ? ` (${Math.min(exchanges, needed)} of ${needed} so far)` : ''}. Premium skips the wait.
        </AppText>
      ) : null}
      {card.degree === 2 ? (
        <AppText variant="caption" tone="subtle" align="center">
          {first} is one intro away. Ask {card.via[0]?.display_name ?? 'a mutual friend'} to introduce you, and you can message right away.
        </AppText>
      ) : null}
    </View>
  ) : null;

  async function toggle(kind: 'muted' | 'hidden') {
    if (!card || !privacy) return;
    const on = !privacy[kind];
    try {
      if (kind === 'muted') await setMuted(card.id, on);
      else await setHiddenFrom(card.id, on);
      setPrivacy({ ...privacy, [kind]: on });
      toast(
        kind === 'muted'
          ? on
            ? `Muted. You won’t see ${first}’s posts. They aren’t told.`
            : `Unmuted ${first}`
          : on
            ? `${first} won’t see your posts, My Out or plans. They aren’t told.`
            : `${first} can see your posts again`,
      );
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  const menuOptions = card
    ? [
        { label: privacy?.muted ? `Unmute ${first}` : `Mute ${first} (hide their posts from me)`, onPress: () => toggle('muted') },
        { label: privacy?.hidden ? `Show my posts to ${first} again` : `Hide my posts from ${first}`, onPress: () => toggle('hidden') },
        { label: `Report ${first}`, onPress: () => router.push({ pathname: '/report', params: { user: card.id, name: card.display_name } }) },
        { label: `Block ${first}`, danger: true, onPress: () => setConfirmBlock(true) },
      ]
    : [];

  return (
    <>
      <BackHeader
        title={card?.display_name ?? 'Profile'}
        right={card ? <IconButton icon="ellipsis-horizontal" label={`Options for ${card.display_name}`} onPress={() => setMenu(true)} /> : undefined}
      />
      <OptionsSheet visible={menu} options={menuOptions} onClose={() => setMenu(false)} />
      <Screen>
        {card ? (
          <ProfileView card={card} pins={pins} onPinChange={(n) => setPins((l) => l.map((p) => (p.id === n.id ? n : p)))} actions={actions}>
            <View style={{ gap: t.space[2], marginTop: t.space[4] }}>
              {confirmBlock ? (
                <>
                  <AppText variant="small" tone="muted" align="center">
                    Block {first}? You won&apos;t see each other anywhere on I&apos;m In, and you&apos;ll be disconnected. They aren&apos;t told.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      label={`Block ${first}`}
                      variant="danger"
                      size="md"
                      style={{ flex: 1 }}
                      onPress={async () => {
                        try {
                          await blockUser(card.id);
                          toast(`${first} is blocked`);
                          goBackOr(router, '/');
                        } catch (e) {
                          toast(friendlyError(e));
                        }
                      }}
                    />
                    <Button label="Cancel" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => setConfirmBlock(false)} />
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Button
                    label="Report"
                    variant="ghost"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: '/report', params: { user: card.id, name: card.display_name } })}
                  />
                  <Button label="Block" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => setConfirmBlock(true)} />
                </View>
              )}
              {iVouched ? (
                <Button
                  label={`Take back my vouch for ${first}`}
                  variant="ghost"
                  size="md"
                  onPress={() =>
                    confirmThen(`Take back your vouch for ${first}?`, 'It comes off their profile. It still counts toward your vouches this month.', async () => {
                      try {
                        await unvouch(card.id);
                        setIVouched(false);
                        toast(`You took back your vouch for ${first}`);
                        fetchProfileCard(id).then(setCard).catch(() => undefined);
                      } catch (e) {
                        toast(friendlyError(e));
                      }
                    })
                  }
                />
              ) : null}
            </View>
          </ProfileView>
        ) : (
          <LoadingDetail />
        )}
      </Screen>
    </>
  );
}
