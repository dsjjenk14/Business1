import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { ProfileView } from '@/components/profile/ProfileView';
import { AppText, Button, Screen, useToast } from '@/components/ui';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchProfileCard, type ProfileCard } from '@/features/profiles/api';
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
          onPress={() => toast('Vouching after a GPS meetup arrives in Phase 3')}
        />
        {card.degree === 1 ? (
          <Button
            label="Message"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            disabled={!card.can_message}
            onPress={() => toast('Chats open in Phase 5')}
          />
        ) : card.degree === 2 ? (
          <Button
            label="Request Intro"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => toast(`Intros via ${card.via[0]?.display_name ?? 'a mutual friend'} arrive in Phase 3`)}
          />
        ) : null}
      </View>
      {card.degree === 1 && !card.can_message ? (
        <AppText variant="caption" tone="subtle" align="center">
          Messaging unlocks after {needed} back-and-forths with {first} on Pins. Premium skips the wait.
        </AppText>
      ) : null}
      {card.degree === 2 ? (
        <AppText variant="caption" tone="subtle" align="center">
          {first} is one intro away. Ask {card.via[0]?.display_name ?? 'a mutual friend'} to introduce you, and you can message right away.
        </AppText>
      ) : null}
    </View>
  ) : null;

  return (
    <>
      <BackHeader title={card?.display_name ?? 'Profile'} />
      <Screen>
        {card ? (
          <ProfileView card={card} pins={pins} onPinChange={(n) => setPins((l) => l.map((p) => (p.id === n.id ? n : p)))} actions={actions} />
        ) : (
          <AppText tone="subtle" align="center">
            Loading…
          </AppText>
        )}
      </Screen>
    </>
  );
}
