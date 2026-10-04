import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, ProfilePic } from '@/components/in-crowd/Avatar';
import { Modal } from '@/components/in-crowd/Dialogs';
import { GameIcon, type IconName } from '@/components/in-crowd/Icons';
import { GText, GameButton, IconCircle, Panel, Pill, Stars, fmtNum, textGlow } from '@/components/in-crowd/Parts';
import { UI } from '@/components/in-crowd/palette';
import { VenueBackdrop } from '@/components/in-crowd/Venue';
import { KIKI, formatFollowers } from '@/features/in-crowd/engine/content';
import { CHAPTERS, LEVELS, TIPS } from '@/features/in-crowd/engine/levels';
import type { LevelDef, TipId } from '@/features/in-crowd/engine/types';
import { buzz } from '@/features/in-crowd/haptics';
import { chapterStars, chapterUnlocked, currentLevelId, isUnlocked, totalStars, useProgress } from '@/features/in-crowd/progress';
import { goBackOr } from '@/lib/navigation';

const TIP_ICON: Partial<Record<TipId, IconName>> = {
  seating: 'seat',
  bar: 'drink',
  charge: 'charger',
  glam: 'glam',
  light: 'light',
  pr: 'contract',
  selfie: 'selfie',
  kitchen: 'order',
  plates: 'plate',
  streak: 'flame',
  viral: 'rocket',
  live: 'live',
  paparazzi: 'paparazzi',
  troll: 'troll',
  drama: 'drama',
  wifi: 'wifi',
  spill: 'spill',
  late: 'late',
};

/** The In Crowd home: Kiki's profile, the five venues and their nights. */
export default function InCrowdHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress, loaded } = useProgress();
  const [open, setOpen] = useState<LevelDef | null>(null);
  const cardW = Math.min(width, 560) - 32;
  const current = currentLevelId(progress);
  const stars = totalStars(progress);

  const play = (id: string) => {
    buzz.medium();
    setOpen(null);
    router.push({ pathname: '/in-crowd/play/[level]', params: { level: id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 16, alignSelf: 'center', width: Math.min(width, 560) }}>
        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconCircle icon="back" label="Back to I'm In" onPress={() => goBackOr(router, '/')} />
          <View style={{ flex: 1 }} />
          <Pill>
            <GameIcon name="coin" size={18} />
            <GText font="black" size={14} color={UI.gold}>
              {fmtNum(progress.coins)}
            </GText>
          </Pill>
          <Pill>
            <GameIcon name="star" size={18} />
            <GText font="black" size={14}>
              {stars}/{LEVELS.length * 3}
            </GText>
          </Pill>
        </View>

        {/* Title */}
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <GText font="black" size={14} color={UI.pink} style={{ letterSpacing: 8, marginBottom: -6 }}>
            THE
          </GText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <GText font="display" size={68} color={UI.gold} style={textGlow(UI.goldDeep, 18)}>
              IN
            </GText>
            <GText font="display" size={68} color={UI.pink} style={textGlow(UI.pinkDeep, 18)}>
              CROWD
            </GText>
          </View>
          <GText font="bold" size={13} color={UI.muted} align="center">
            Run the hottest creator parties in Clout City. Seat the stars, keep them posting, never let them unfollow.
          </GText>
        </View>

        {/* Kiki */}
        <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <Avatar look={KIKI.look} expr="happy" size={64} id="home-kiki" />
          <View style={{ flex: 1, gap: 2 }}>
            <GText font="black" size={17}>
              {KIKI.name}
            </GText>
            <GText size={12} color={UI.muted}>
              {KIKI.handle} · {KIKI.bio}
            </GText>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <GameIcon name="follower" size={16} />
                <GText font="black" size={13} color={UI.cyan}>
                  {formatFollowers(progress.followers)}
                </GText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <GameIcon name="trophy" size={16} />
                <GText font="black" size={13}>
                  {progress.totals.nights} {progress.totals.nights === 1 ? 'night' : 'nights'}
                </GText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <GameIcon name="flame" size={16} />
                <GText font="black" size={13}>
                  ×{progress.totals.bestStreak}
                </GText>
              </View>
            </View>
          </View>
        </Panel>

        {loaded ? (
          <GameButton label={progress.totals.nights ? `Play night ${current}` : 'Start the first night'} icon="play" size="lg" onPress={() => play(current)} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GameButton label="Shop" icon="shop" tone="gold" style={{ flex: 1 }} onPress={() => router.push('/in-crowd/shop')} />
          <GameButton label="Guide" icon="book" tone="cyan" style={{ flex: 1 }} onPress={() => router.push('/in-crowd/guide')} />
        </View>

        {/* Venues */}
        {CHAPTERS.map((ch) => {
          const unlocked = chapterUnlocked(progress, ch.id);
          const levels = LEVELS.filter((l) => l.chapter === ch.id);
          return (
            <View key={ch.id} style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: UI.panel, borderWidth: 1, borderColor: UI.line }}>
              <View style={{ height: (cardW * 120) / 400, overflow: 'hidden' }}>
                <VenueBackdrop venue={ch.venue} width={cardW} crop={{ y: 0, h: 120 }} />
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40, backgroundColor: 'rgba(26,20,36,0.55)' }} />
                <View style={{ position: 'absolute', left: 12, bottom: 6, right: 80 }}>
                  <GText font="black" size={10} color={UI.gold}>
                    VENUE {ch.id}
                  </GText>
                  <GText font="display" size={26} lines={1}>
                    {ch.title}
                  </GText>
                </View>
                <View style={{ position: 'absolute', right: 10, bottom: 6, alignItems: 'center' }}>
                  <ProfilePic look={ch.client.look} size={52} id={`ch-${ch.id}`} ring={UI.gold} />
                </View>
              </View>
              <View style={{ padding: 12, gap: 10, opacity: unlocked ? 1 : 0.55 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <GText size={12} color={UI.muted} style={{ flex: 1 }}>
                    Hosted by{' '}
                    <GText font="black" size={12}>
                      {ch.client.name}
                    </GText>{' '}
                    · {ch.place}
                  </GText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <GameIcon name="star" size={14} />
                    <GText font="black" size={12}>
                      {chapterStars(progress, ch.id)}/12
                    </GText>
                  </View>
                </View>
                {unlocked ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {levels.map((l) => {
                      const rec = progress.levels[l.id];
                      const can = isUnlocked(progress, l.id);
                      const isNext = l.id === current;
                      return (
                        <Pressable
                          key={l.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Night ${l.id}, ${l.name}${can ? '' : ', locked'}`}
                          disabled={!can}
                          onPress={() => {
                            buzz.select();
                            setOpen(l);
                          }}
                          style={({ pressed }) => ({
                            flex: 1,
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 10,
                            borderRadius: 16,
                            backgroundColor: isNext ? 'rgba(255,77,141,0.18)' : UI.panel2,
                            borderWidth: 1.5,
                            borderColor: isNext ? UI.pink : rec?.stars ? 'rgba(255,209,102,0.5)' : UI.line,
                            opacity: pressed ? 0.75 : 1,
                          })}>
                          {can ? (
                            <GText font="display" size={26} color={isNext ? UI.pink : UI.text}>
                              {l.index}
                            </GText>
                          ) : (
                            <GameIcon name="lock" size={24} />
                          )}
                          <Stars count={rec?.stars ?? 0} size={12} gap={1} />
                          <GText size={9.5} color={UI.muted} lines={1}>
                            {rec?.best ? fmtNum(rec.best) : can ? 'New' : 'Locked'}
                          </GText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <GameIcon name="lock" size={22} />
                    <GText size={12.5} color={UI.muted} style={{ flex: 1 }}>
                      Reach the goal on every night of {CHAPTERS[ch.id - 2]?.title ?? 'the last venue'} to unlock.
                    </GText>
                  </View>
                )}
              </View>
            </View>
          );
        })}
        <GText size={11} color={UI.subtle} align="center">
          Every creator in The In Crowd is made up. Progress is saved on this device.
        </GText>
      </ScrollView>

      {open ? (
        <Modal onBackdrop={() => setOpen(null)}>
          <Panel style={{ width: '100%', maxWidth: 400, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <GText font="black" size={11} color={UI.pink}>
                NIGHT {open.id} · {CHAPTERS[open.chapter - 1]?.title.toUpperCase()}
              </GText>
              <IconCircle icon="close" label="Close" size={34} onPress={() => setOpen(null)} />
            </View>
            <GText font="display" size={36}>
              {open.name}
            </GText>
            <GText size={14} color={UI.muted}>
              {open.blurb}
            </GText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Pill>
                <GameIcon name="clock" size={14} />
                <GText font="bold" size={12}>
                  {Math.floor(open.duration / 60)}:{String(open.duration % 60).padStart(2, '0')} party
                </GText>
              </Pill>
              <Pill>
                <GameIcon name="seat" size={14} />
                <GText font="bold" size={12}>
                  {open.tables} tables · {open.guests} guests
                </GText>
              </Pill>
              {open.late ? (
                <Pill>
                  <GameIcon name="late" size={14} />
                  <GText font="bold" size={12}>
                    {open.late} late VIPs
                  </GText>
                </Pill>
              ) : null}
              {open.lives.length ? (
                <Pill>
                  <GameIcon name="live" size={14} />
                  <GText font="bold" size={12}>
                    {open.lives.length} live {open.lives.length > 1 ? 'moments' : 'moment'}
                  </GText>
                </Pill>
              ) : null}
            </View>
            {open.tips.length ? (
              <View style={{ gap: 6 }}>
                <GText font="black" size={11} color={UI.gold}>
                  NEW TONIGHT
                </GText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {open.tips.map((t) => (
                    <Pill key={t} color={UI.panel3}>
                      <GameIcon name={TIP_ICON[t] ?? 'star'} size={16} />
                      <GText font="bold" size={12}>
                        {TIPS[t].title}
                      </GText>
                    </Pill>
                  ))}
                </View>
              </View>
            ) : null}
            {open.troubles ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <GText font="black" size={11} color={UI.red}>
                  TROUBLE:
                </GText>
                {open.troubles.kinds.map((k) => (
                  <GameIcon key={k} name={k === 'spill' ? 'spill' : k} size={20} />
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { label: 'Goal', value: open.goal, stars: 1 },
                { label: 'Great', value: Math.round((open.goal + open.expert) / 2), stars: 2 },
                { label: 'Expert', value: open.expert, stars: 3 },
              ].map((x) => (
                <View key={x.label} style={{ flex: 1, alignItems: 'center', gap: 3, padding: 8, borderRadius: 12, backgroundColor: UI.panel2 }}>
                  <Stars count={x.stars} size={11} gap={0} />
                  <GText font="black" size={14}>
                    {fmtNum(x.value)}
                  </GText>
                  <GText size={10} color={UI.muted}>
                    {x.label}
                  </GText>
                </View>
              ))}
            </View>
            {progress.levels[open.id]?.best ? (
              <GText size={12} color={UI.muted} align="center">
                Your best: {fmtNum(progress.levels[open.id]?.best ?? 0)} · played {progress.levels[open.id]?.plays ?? 0}×
              </GText>
            ) : null}
            <GameButton label="Play" icon="play" size="lg" onPress={() => play(open.id)} />
            <GameButton
              label="Watch Kiki play it"
              icon="phone"
              tone="ghost"
              size="sm"
              onPress={() => {
                setOpen(null);
                router.push({ pathname: '/in-crowd/play/[level]', params: { level: open.id, demo: '1' } });
              }}
            />
          </Panel>
        </Modal>
      ) : null}
    </View>
  );
}
