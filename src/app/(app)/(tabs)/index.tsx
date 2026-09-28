import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { DateStrip } from '@/components/home/DateStrip';
import { PlacementCard } from '@/components/places/PlacementCard';
import { GoingOutStrip } from '@/components/home/GoingOutStrip';
import { GroupChatsCard, type ChatPreview } from '@/components/home/GroupChatsCard';
import { ShareCard } from '@/components/home/ShareCard';
import { TonightPickCard } from '@/components/home/TonightPickCard';
import { VouchCard } from '@/components/home/VouchCard';
import { PinCard } from '@/components/pins/PinCard';
import { AppText, Card, LoadingList, Screen, Section, useToast } from '@/components/ui';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import { fetchDateMode, fetchMyDates, type DateModeStatus, type MyDate } from '@/features/dates/api';
import { fetchFeedPlacement, type FeedPlacement } from '@/features/places/api';
import { fetchFeed, type FeedPin } from '@/features/pins/api';
import { fetchTonightNetwork, fetchTonightPick, rsvp, type TonightPerson, type TonightPick } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home. A social feed first (Dominique: "not strictly about going out"):
 * share something, the latest pins from your network (or the whole community
 * while your network is quiet), your group chats; then who's going out
 * tonight, dates, vouches and one pick for tonight.
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
  const [pinsFrom, setPinsFrom] = useState<'network' | 'community'>('network');
  const [chats, setChats] = useState<ChatPreview[]>([]);
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
        fetchFeed({ mode: 'network', limit: 5 }).then(async (pins) =>
          pins.length ? { pins, from: 'network' as const } : { pins: await fetchFeed({ mode: 'community', limit: 5 }), from: 'community' as const },
        ),
        fetchTonightPick(),
        fetchDateMode().catch(() => null),
        fetchMyDates().catch(() => []),
        fetchFeedPlacement().catch(() => null),
        supabase.rpc('inbox').then(({ data }) => ((data ?? []) as (ChatPreview & { kind: string })[]).filter((c) => c.kind !== 'direct').slice(0, 3)),
      ])
        .then(([people, feed, p, mode, d, place, groupChats]) => {
          if (cancelled) return;
          setTonight(people);
          setNetworkPins(feed.pins);
          setPinsFrom(feed.from);
          setChats(groupChats);
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

      <ShareCard name={profile?.display_name ?? firstName} avatarUrl={profile?.avatar_url ?? null} />

      <Section title={pinsFrom === 'network' ? 'From your network' : 'Happening on I’m In'} action={{ label: 'See all', onPress: () => router.push('/pins') }}>
        {networkPins === null ? (
          <LoadingList rows={2} />
        ) : networkPins.length === 0 ? (
          <Card>
            <AppText variant="small" tone="muted">
              No pins yet. Be the first: share what you&apos;re up to, a recommendation, or a question.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: t.space[3] }}>
            {/* A partner placement (always labeled) goes after the second pin. */}
            {networkPins.map((p, i) => (
              <View key={p.id} style={{ gap: t.space[3] }}>
                <PinCard pin={p} onChange={(n) => setNetworkPins((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null)} />
                {placement && i === Math.min(1, networkPins.length - 1) ? <PlacementCard place={placement} /> : null}
              </View>
            ))}
          </View>
        )}
      </Section>

      <GroupChatsCard chats={chats} />

      <GoingOutStrip people={tonight} amLive={amLive} />

      <DateStrip mode={dateMode} dates={dates} />

      <VouchCard vouchCount={profile?.vouch_count ?? 0} onPress={() => router.push('/profile')} />

      {pick ? <TonightPickCard pick={pick} onRsvp={onRsvp} rsvpd={rsvpd} /> : null}
    </Screen>
  );
}
