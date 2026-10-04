import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/celeb-dash/Avatar';
import { GuestCard } from '@/components/celeb-dash/GuestCard';
import { GameIcon, type IconName } from '@/components/celeb-dash/Icons';
import { GText, IconCircle, NicheChip, Panel, Pill } from '@/components/celeb-dash/Parts';
import { UI } from '@/components/celeb-dash/palette';
import { NICHES, NICHE_ORDER, REQUESTS, ROSTER, STATIONS, TRAITS, TROUBLES, formatFollowers } from '@/features/celeb-dash/engine/content';
import { CHAPTERS, TIPS } from '@/features/celeb-dash/engine/levels';
import type { Niche, RequestKind, TipId } from '@/features/celeb-dash/engine/types';
import { goBackOr } from '@/lib/navigation';

type Tab = 'basics' | 'guests' | 'venues';

const TIP_ICON: Record<string, IconName> = {
  seat: 'seat',
  drink: 'drink',
  charger: 'charger',
  glam: 'glam',
  light: 'light',
  contract: 'contract',
  selfie: 'selfie',
  order: 'order',
  plate: 'plate',
  flame: 'flame',
  rocket: 'rocket',
  live: 'live',
  paparazzi: 'paparazzi',
  troll: 'troll',
  drama: 'drama',
  wifi: 'wifi',
  spill: 'spill',
  late: 'late',
};

const REQUEST_ICON: Record<RequestKind, IconName> = {
  drink: 'drink',
  charger: 'charger',
  glam: 'glam',
  light: 'light',
  contract: 'contract',
  selfie: 'selfie',
  order: 'order',
  food: 'sushi',
  plate: 'plate',
};

/** How to play, every guest in Clout City, and every venue. */
export default function CelebDashGuide() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('basics');
  const [niche, setNiche] = useState<Niche | null>(null);
  const w = Math.min(width, 560);
  const cardW = (w - 32 - 10) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 10, alignSelf: 'center', width: w }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconCircle icon="back" label="Back" onPress={() => goBackOr(router, '/celeb-dash')} />
          <GText font="display" size={34} style={{ flex: 1 }}>
            Guide
          </GText>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: UI.panel, borderRadius: 14, padding: 4, gap: 4 }}>
          {(['basics', 'guests', 'venues'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: tab === t ? UI.pink : 'transparent', alignItems: 'center' }}>
              <GText font="black" size={13}>
                {t === 'basics' ? 'How to play' : t === 'guests' ? `Guests (${ROSTER.length})` : 'Venues'}
              </GText>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12, alignSelf: 'center', width: w }}>
        {tab === 'basics' ? (
          <>
            <Panel style={{ gap: 8 }}>
              <GText font="black" size={16}>
                A night in three parts
              </GText>
              <GText size={13} color={UI.muted}>
                1. Seat the guest list. Each creator has niches they love and hate, plus a BFF or a rival. Happier seating means more hearts to start.
              </GText>
              <GText size={13} color={UI.muted}>
                2. Run the party. Tap counters to grab things, tap guests to hand them over. You can queue up to six taps; numbers show the order.
              </GText>
              <GText size={13} color={UI.muted}>
                3. When the clock runs out, every happy guest still there adds a bonus. Hit the goal for one star, Expert for three.
              </GText>
            </Panel>
            <Panel style={{ gap: 8 }}>
              <GText font="black" size={16}>
                How clout is counted
              </GText>
              <GText size={13} color={UI.muted}>
                Each request is worth a base amount, times how happy the guest is (up to ×1.2), times star power (×1.25 over 1M followers, ×1.5 over 5M, another ×1.5 for divas), times your streak (up to ×3), times two while you’re viral. Anyone who unfollows costs 60.
              </GText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(REQUESTS) as RequestKind[]).map((k) => (
                  <Pill key={k}>
                    <GameIcon name={REQUEST_ICON[k]} size={16} />
                    <GText font="bold" size={11.5}>
                      {REQUESTS[k].label} {REQUESTS[k].points}
                    </GText>
                  </Pill>
                ))}
              </View>
            </Panel>
            <Panel style={{ gap: 8 }}>
              <GText font="black" size={16}>
                The counters
              </GText>
              {(Object.keys(STATIONS) as (keyof typeof STATIONS)[]).map((k) => (
                <GText key={k} size={13} color={UI.muted}>
                  <GText font="black" size={13}>
                    {STATIONS[k].label}:{' '}
                  </GText>
                  {STATIONS[k].blurb}
                </GText>
              ))}
            </Panel>
            <Panel style={{ gap: 8 }}>
              <GText font="black" size={16}>
                Trouble
              </GText>
              {(Object.keys(TROUBLES) as (keyof typeof TROUBLES)[]).map((k) => (
                <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <GameIcon name={k === 'spill' ? 'spill' : k} size={26} />
                  <GText size={13} color={UI.muted} style={{ flex: 1 }}>
                    <GText font="black" size={13}>
                      {TROUBLES[k].label}:{' '}
                    </GText>
                    {TROUBLES[k].news}. {TROUBLES[k].fix} it for {TROUBLES[k].points} clout.
                  </GText>
                </View>
              ))}
            </Panel>
            {(Object.keys(TIPS) as TipId[]).map((id) => (
              <View key={id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: UI.panel2, alignItems: 'center', justifyContent: 'center' }}>
                  <GameIcon name={TIP_ICON[TIPS[id].icon] ?? 'star'} size={30} />
                </View>
                <View style={{ flex: 1 }}>
                  <GText font="black" size={14}>
                    {TIPS[id].title}
                  </GText>
                  <GText size={12.5} color={UI.muted}>
                    {TIPS[id].body}
                  </GText>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {tab === 'guests' ? (
          <>
            <Panel style={{ gap: 8 }}>
              <GText font="black" size={16}>
                Who gets along
              </GText>
              {NICHE_ORDER.map((n) => (
                <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <NicheChip niche={n} />
                  {NICHES[n].likes.map((l) => (
                    <NicheChip key={l} niche={l} sign="+" small />
                  ))}
                  {NICHES[n].dislikes.map((d) => (
                    <NicheChip key={d} niche={d} sign="−" small />
                  ))}
                  <GText size={11} color={UI.subtle}>
                    {NICHES[n].why}
                  </GText>
                </View>
              ))}
              <GText size={12} color={UI.muted}>
                Traits:{' '}
                {(Object.keys(TRAITS) as (keyof typeof TRAITS)[])
                  .filter((t) => t !== 'none')
                  .map((t) => `${TRAITS[t].label} (${TRAITS[t].blurb.toLowerCase().replace(/\.$/, '')})`)
                  .join(' · ')}
              </GText>
            </Panel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Pressable onPress={() => setNiche(null)} accessibilityRole="button">
                <Pill color={niche === null ? UI.pink : UI.panel2}>
                  <GText font="black" size={12}>
                    Everyone
                  </GText>
                </Pill>
              </Pressable>
              {NICHE_ORDER.map((n) => (
                <Pressable key={n} onPress={() => setNiche(n)} accessibilityRole="button">
                  <Pill color={niche === n ? NICHES[n].color : UI.panel2}>
                    <GText font="black" size={12} color={niche === n ? '#1B1426' : UI.text}>
                      {NICHES[n].label}
                    </GText>
                  </Pill>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ROSTER.filter((g) => !niche || g.niche === niche).map((g) => (
                <GuestCard key={g.id} profile={g} width={cardW} showBio />
              ))}
            </View>
          </>
        ) : null}

        {tab === 'venues'
          ? CHAPTERS.map((ch) => (
              <Panel key={ch.id} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Avatar look={ch.client.look} expr="happy" size={72} id={`guide-${ch.id}`} />
                  <View style={{ flex: 1 }}>
                    <GText font="black" size={11} color={UI.gold}>
                      VENUE {ch.id}
                    </GText>
                    <GText font="display" size={28}>
                      {ch.title}
                    </GText>
                    <GText size={12} color={UI.muted}>
                      {ch.place}
                    </GText>
                  </View>
                </View>
                <GText size={13}>
                  <GText font="black" size={13}>
                    {ch.client.name}
                  </GText>{' '}
                  <GText size={12} color={UI.muted}>
                    {ch.client.handle} · {formatFollowers(ch.client.followers)} followers
                  </GText>
                </GText>
                <GText size={13} color={UI.muted}>
                  {ch.client.bio}
                </GText>
                {ch.intro.map((line, i) => (
                  <GText key={i} size={13} color={UI.text}>
                    “{line}”
                  </GText>
                ))}
              </Panel>
            ))
          : null}
      </ScrollView>
    </View>
  );
}
