import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { DateStrip } from '@/components/home/DateStrip';
import { PlacementCard } from '@/components/places/PlacementCard';
import { GoingOutStrip } from '@/components/home/GoingOutStrip';
import { TonightPickCard } from '@/components/home/TonightPickCard';
import { VouchCard } from '@/components/home/VouchCard';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Card, Screen, Section, useToast } from '@/components/ui';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import { fetchDateMode, fetchMyDates, type DateModeStatus, type MyDate } from '@/features/dates/api';
import { fetchFeedPlacement, type FeedPlacement } from '@/features/places/api';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchTonightNetwork, fetchTonightPick, rsvp, type TonightPerson, type TonightPick } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home. Kept deliberately simple (spec: five sections max):
 * greeting, Going Out Tonight, vouches, From Your Network, one pick for tonight.
 * The "I'm On a Date" strip joins only while Date Mode is active (Phase 5).
 */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile, session, refreshProfile } = useAuth();
  const { dismissed } = useFirstWeekChecklist();
  const shownChecklist = useRef(false);

  const [tonight, setTonight] = useState<TonightPerson[]>([]);
  const [networkPins, setNetworkPins] = useState<FeedPin[] | null>(null);
  const [pick, setPick] = useState<TonightPick | null>(null);
  const [rsvpd, setRsvpd] = useState(false);
  const [dateMode, setDateMode] = useState<DateModeStatus | null>(null);
  const [dates, setDates] = useState<MyDate[]>([]);
  const [placement, setPlacement] = useState<FeedPlacement | null>(null);

  // First-week checklist pops up once after first login, until dismissed.
  useEffect(() => {
    if (dismissed === false && !shownChecklist.current) {
      shownChecklist.current = true;
      router.push('/checklist');
    }
  }, [dismissed, router]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        fetchTonightNetwork(),
        fetchFeed({ mode: 'network', limit: 2 }),
        fetchTonightPick(),
        fetchDateMode().catch(() => null),
        fetchMyDates().catch(() => []),
        fetchFeedPlacement().catch(() => null),
      ])
        .then(([people, pins, p, mode, d, place]) => {
          if (cancelled) return;
          setTonight(people);
          setNetworkPins(pins);
          setPick(p);
          setDateMode(mode);
          setDates(d);
          setPlacement(place);
          setRsvpd(false);
        })
        .catch(() => {});
      refreshProfile();
      return () => {
        cancelled = true;
      };
    }, [refreshProfile]),
  );

  async function onRsvp() {
    if (!pick || !session) return;
    try {
      await rsvp(pick.event_id, session.user.id);
      setRsvpd(true);
      toast(`You're in: ${pick.title}`);
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  const firstName = profile?.full_name.split(' ')[0] ?? '';
  const amLive = tonight.some((p) => p.is_me);

  return (
    <Screen>
      <View style={{ gap: t.space[1] }}>
        <AppText variant="label" tone="subtle">
          {greeting()}
        </AppText>
        <AppText variant="h1" accessibilityRole="header">
          Hey, {firstName}
        </AppText>
      </View>

      <GoingOutStrip people={tonight} amLive={amLive} />

      <DateStrip mode={dateMode} dates={dates} />

      <VouchCard vouchCount={profile?.vouch_count ?? 0} onPress={() => router.push('/profile')} />

      <Section title="From your network" action={{ label: 'See all', onPress: () => router.push('/pins') }}>
        {networkPins === null ? null : networkPins.length === 0 ? (
          <Card>
            <AppText variant="small" tone="muted">
              When people in your circle and network drop pins, the latest show up here.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: t.space[3] }}>
            {/* Two slots: a partner placement (always labeled) can take the second one. */}
            {networkPins.slice(0, placement ? 1 : 2).map((p) => (
              <PinCard key={p.id} pin={p} onChange={(n) => setNetworkPins((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null)} />
            ))}
            {placement ? <PlacementCard place={placement} /> : null}
          </View>
        )}
      </Section>

      {pick ? <TonightPickCard pick={pick} onRsvp={onRsvp} rsvpd={rsvpd} /> : null}
    </Screen>
  );
}
