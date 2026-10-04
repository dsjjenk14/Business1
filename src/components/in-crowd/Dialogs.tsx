import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CLIENTS, RHEA, ROSTER_BY_ID, formatFollowers, withMe } from '@/features/in-crowd/engine/content';
import { TIPS } from '@/features/in-crowd/engine/levels';
import type { Breakdown, Chapter, LevelDef, Look, Profile, Scene, TipId } from '@/features/in-crowd/engine/types';

import { Avatar } from './Avatar';
import { GameIcon, type IconName } from './Icons';
import { GText, GameButton, Panel, Stars, fmtNum } from './Parts';
import { UI } from './palette';

/** Dims the board and centers a card. */
export function Modal({ children, onBackdrop }: { children: ReactNode; onBackdrop?: () => void }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }}>
      <Pressable accessibilityLabel="Close" onPress={onBackdrop} disabled={!onBackdrop} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(7,5,11,0.78)' }} />
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        {children}
      </View>
    </View>
  );
}

const TIP_ICONS: Record<string, IconName> = {
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
  twist: 'twist',
};

/** "New tonight" cards, one per mechanic, before the night starts. */
export function TipCards({ tips, onDone }: { tips: TipId[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const tip = TIPS[tips[i] as TipId];
  if (!tip) return null;
  const last = i >= tips.length - 1;
  return (
    <Modal>
      <Panel style={{ width: '100%', maxWidth: 380, alignItems: 'center', gap: 12, paddingVertical: 22 }}>
        <GText font="black" size={11} color={UI.pink}>
          NEW TONIGHT {tips.length > 1 ? `· ${i + 1} OF ${tips.length}` : ''}
        </GText>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: UI.panel2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: UI.line }}>
          <GameIcon name={TIP_ICONS[tip.icon] ?? 'star'} size={58} />
        </View>
        <GText font="display" size={30} align="center">
          {tip.title}
        </GText>
        <GText size={14.5} color={UI.muted} align="center">
          {tip.body}
        </GText>
        <GameButton label={last ? 'Got it' : 'Next'} icon={last ? 'check' : 'next'} onPress={() => (last ? onDone() : setI(i + 1))} style={{ alignSelf: 'stretch', marginTop: 4 }} />
      </Panel>
    </Modal>
  );
}

type Speaker = { name: string; handle: string; followers: number; look: Look | null; id: string };

/** Who's talking in a scene: the planner, a client, a guest, Rhea, or the anonymous leak account. */
function speakerFor(who: string, me: Profile, meLook: Look): Speaker {
  if (who === 'me') return { name: me.name, handle: me.handle, followers: me.followers, look: meLook, id: 'me' };
  if (who === 'leaks') return { name: 'The Tea Leaks', handle: '@thetealeaks', followers: 3_300_000, look: null, id: 'leaks' };
  const p = CLIENTS[who] ?? ROSTER_BY_ID[who] ?? (who === RHEA.id ? RHEA : null);
  return p ? { name: p.name, handle: p.handle, followers: p.followers, look: p.look, id: p.id } : { name: who, handle: '', followers: 0, look: null, id: who };
}

/**
 * A story scene: one line at a time, with the speaker's portrait. Plot
 * twists get their own flashing header.
 */
export function SceneDialog({ scene, me, meLook, title, onDone }: { scene: Scene; me: Profile; meLook: Look; title?: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const lines = scene.lines.map((l) => ({ ...l, text: withMe(l.text, me.name.split(' ')[0] ?? me.name) }));
  const line = lines[i] ?? lines[lines.length - 1];
  if (!line) return null;
  const speaker = speakerFor(line.who, me, meLook);
  const last = i >= lines.length - 1;
  const mine = line.who === 'me';
  const anon = line.who === 'leaks';
  const next = () => (last ? onDone() : setI(i + 1));
  return (
    <Modal>
      <View style={{ width: '100%', maxWidth: 420 }}>
        {scene.twist ? (
          <View style={{ alignSelf: 'center', marginBottom: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: UI.pink, transform: [{ rotate: '-2deg' }] }}>
            <GText font="display" size={28} color="#FFFFFF">
              PLOT TWIST
            </GText>
          </View>
        ) : null}
        <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: -18, zIndex: 2, paddingHorizontal: 8 }}>
          {speaker.look ? (
            <Avatar look={speaker.look} expr={anon ? 'ok' : scene.twist && !mine ? 'shock' : 'happy'} size={128} id={`scene-${speaker.id}`} />
          ) : (
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: '#111317', borderWidth: 3, borderColor: UI.red, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <GameIcon name="phone" size={64} />
            </View>
          )}
        </View>
        <Panel style={{ gap: 10, paddingTop: 22, borderColor: anon ? UI.red : mine ? UI.pink : UI.gold, borderWidth: 1.5 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={next} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <GText font="black" size={16} color={anon ? UI.red : UI.text}>
                {speaker.name}
              </GText>
              <GText size={11} color={UI.muted}>
                {speaker.handle}
                {speaker.followers ? ` · ${formatFollowers(speaker.followers)}` : ''}
              </GText>
            </View>
            {i === 0 && title ? (
              <GText font="bold" size={11} color={UI.gold}>
                {title}
              </GText>
            ) : null}
            <GText size={16} color={UI.text}>
              {line.text}
            </GText>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {lines.map((_, k) => (
                <View key={k} style={{ width: k === i ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? UI.pink : UI.panel3 }} />
              ))}
            </View>
            <GameButton label={last ? 'Let’s go' : 'Next'} size="sm" icon={last ? 'play' : 'next'} onPress={next} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

export function PauseMenu({
  level,
  haptics,
  onResume,
  onRestart,
  onQuit,
  onHaptics,
  onTips,
  passUsed,
}: {
  level: LevelDef;
  haptics: boolean;
  /** The doors are open, so this night's VIP Pass is already in use. */
  passUsed?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onHaptics: () => void;
  onTips: () => void;
}) {
  return (
    <Modal onBackdrop={onResume}>
      <Panel style={{ width: '100%', maxWidth: 360, gap: 12, alignItems: 'stretch' }}>
        <GText font="black" size={11} color={UI.pink} align="center">
          NIGHT {level.id} · PAUSED
        </GText>
        <GText font="display" size={34} align="center">
          {level.name}
        </GText>
        <GText size={13} color={UI.muted} align="center">
          {level.blurb}
        </GText>
        <GameButton label="Resume" icon="play" onPress={onResume} size="lg" />
        {passUsed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,77,141,0.12)' }}>
            <GameIcon name="pass" size={22} />
            <GText size={12} color={UI.muted} style={{ flex: 1 }}>
              Restarting or leaving now uses up tonight’s VIP Pass.
            </GText>
          </View>
        ) : null}
        <GameButton label="Restart night" icon="retry" tone="dark" onPress={onRestart} />
        <GameButton label="How to play" icon="book" tone="dark" onPress={onTips} />
        <GameButton label={`Vibration: ${haptics ? 'On' : 'Off'}`} icon="phone" tone="dark" onPress={onHaptics} />
        <GameButton label="Back to the map" icon="map" tone="ghost" onPress={onQuit} />
      </Panel>
    </Modal>
  );
}

/** Every tip, for the pause menu's "How to play". */
export function TipList({ onClose }: { onClose: () => void }) {
  return (
    <Modal onBackdrop={onClose}>
      <Panel style={{ width: '100%', maxWidth: 420, maxHeight: '86%', gap: 10 }}>
        <GText font="display" size={30} align="center">
          How to play
        </GText>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
          {(Object.keys(TIPS) as TipId[]).map((id) => (
            <View key={id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: UI.panel2, alignItems: 'center', justifyContent: 'center' }}>
                <GameIcon name={TIP_ICONS[TIPS[id].icon] ?? 'star'} size={28} />
              </View>
              <View style={{ flex: 1 }}>
                <GText font="black" size={13.5}>
                  {TIPS[id].title}
                </GText>
                <GText size={12} color={UI.muted}>
                  {TIPS[id].body}
                </GText>
              </View>
            </View>
          ))}
        </ScrollView>
        <GameButton label="Close" icon="close" tone="dark" onPress={onClose} />
      </Panel>
    </Modal>
  );
}

function useCountUp(target: number, ms = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const QUOTES = [
  "Hmm. Let's run that back before anyone checks my mentions.",
  'We did it! A few hiccups, but the feed looks good.',
  'That was a really good night. People are still posting about it.',
  'Okay, you are officially my favorite person. Legendary.',
];
const TITLES = ['Rough night', 'Good night', 'Great night', 'Legendary night'];

const ROWS: { key: keyof Breakdown; label: string; negative?: boolean }[] = [
  { key: 'seating', label: 'Seating chart' },
  { key: 'service', label: 'Requests filled' },
  { key: 'streaks', label: 'Streak bonus' },
  { key: 'viral', label: 'Viral bonus' },
  { key: 'troubles', label: 'Trouble handled' },
  { key: 'live', label: 'Live moments' },
  { key: 'late', label: 'Late VIPs seated' },
  { key: 'happy', label: 'Happy guests at close' },
  { key: 'cleanFeed', label: 'Clean feed (no unfollows)' },
  { key: 'penalties', label: 'Unfollows', negative: true },
];

export function ResultsCard({
  level,
  chapter,
  score,
  stars,
  breakdown,
  stats,
  coins,
  followers,
  plannerFollowers,
  newBest,
  hasNext,
  demo,
  me,
  passes,
  onNext,
  onReplay,
  onMap,
}: {
  level: LevelDef;
  chapter: Chapter;
  score: number;
  stars: number;
  breakdown: Breakdown;
  stats: { served: number; unfollows: number; troubles: number; bestStreak: number; lives: number; missedLives: number };
  coins: number;
  followers: number;
  plannerFollowers: number;
  newBest: boolean;
  hasNext: boolean;
  demo?: boolean;
  /** The planner's first name. */
  me: string;
  /** VIP Passes after this night, and when the next one refills (ms, 0 = full). */
  passes: { count: number; nextIn: number };
  onNext: () => void;
  onReplay: () => void;
  onMap: () => void;
}) {
  const shown = useCountUp(Math.max(0, score));
  const passed = stars > 0;
  return (
    <Modal>
      <Panel style={{ width: '100%', maxWidth: 420, maxHeight: '94%', padding: 0, overflow: 'hidden' }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <GText font="black" size={11} color={UI.pink}>
              {demo ? 'DEMO · ' : ''}NIGHT {level.id} · {level.name.toUpperCase()}
            </GText>
            <GText font="display" size={40} align="center" color={passed ? UI.gold : UI.text}>
              {TITLES[stars]}
            </GText>
            <Stars count={stars} size={40} gap={6} />
            <GText font="display" size={46} color={UI.text}>
              {fmtNum(shown)}
            </GText>
            <GText size={12} color={UI.muted}>
              Goal {fmtNum(level.goal)} · Expert {fmtNum(level.expert)}
              {newBest ? '  ·  ' : ''}
              {newBest ? (
                <GText font="black" size={12} color={UI.gold}>
                  New best!
                </GText>
              ) : null}
            </GText>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: UI.panel2, borderRadius: 16, padding: 10 }}>
            <Avatar look={chapter.client.look} expr={stars >= 2 ? 'love' : stars === 1 ? 'happy' : 'meh'} size={52} id="results-client" />
            <View style={{ flex: 1 }}>
              <GText font="black" size={12}>
                {chapter.client.name}
              </GText>
              <GText size={13} color={UI.muted}>
                “{QUOTES[stars]}”
              </GText>
            </View>
          </View>

          <View style={{ gap: 5 }}>
            {ROWS.filter((r) => breakdown[r.key] !== 0).map((r) => (
              <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <GText size={13} color={UI.muted}>
                  {r.label}
                </GText>
                <GText font="black" size={13} color={r.negative ? UI.red : UI.text}>
                  {r.negative ? '−' : '+'}
                  {fmtNum(breakdown[r.key])}
                </GText>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: 'check' as IconName, label: 'Requests', value: String(stats.served) },
              { icon: 'flame' as IconName, label: 'Best streak', value: `×${stats.bestStreak}` },
              { icon: 'troll' as IconName, label: 'Trouble fixed', value: String(stats.troubles) },
              { icon: 'live' as IconName, label: 'Lives', value: level.lives.length ? `${stats.lives}/${level.lives.length}` : '—' },
              { icon: 'heartEmpty' as IconName, label: 'Unfollows', value: String(stats.unfollows) },
            ].map((x) => (
              <View key={x.label} style={{ flexGrow: 1, minWidth: 100, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 12, backgroundColor: UI.panel2 }}>
                <GameIcon name={x.icon} size={18} />
                <View>
                  <GText font="black" size={14}>
                    {x.value}
                  </GText>
                  <GText size={10} color={UI.muted}>
                    {x.label}
                  </GText>
                </View>
              </View>
            ))}
          </View>

          {demo ? (
            <GText size={13} color={UI.muted} align="center">
              That was {me} on autopilot. Demo nights don’t earn coins or stars. Your turn!
            </GText>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,209,102,0.12)', borderWidth: 1, borderColor: UI.goldDeep }}>
                <GameIcon name="coin" size={26} />
                <View>
                  <GText font="black" size={16} color={UI.gold}>
                    +{fmtNum(coins)}
                  </GText>
                  <GText size={10} color={UI.muted}>
                    coins for the shop
                  </GText>
                </View>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: 'rgba(76,201,240,0.12)', borderWidth: 1, borderColor: '#2A8CB0' }}>
                <GameIcon name="follower" size={26} />
                <View>
                  <GText font="black" size={16} color={UI.cyan}>
                    +{formatFollowers(followers)}
                  </GText>
                  <GText size={10} color={UI.muted}>
                    {me} now has {formatFollowers(plannerFollowers)}
                  </GText>
                </View>
              </View>
            </View>
          )}

          {!demo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: passed ? 'rgba(124,242,156,0.1)' : 'rgba(255,92,122,0.12)', borderWidth: 1, borderColor: passed ? '#2F8F57' : UI.red }}>
              <GameIcon name="pass" size={28} />
              <View style={{ flex: 1 }}>
                <GText font="black" size={13}>
                  {passed ? 'Your VIP Pass is back' : 'You used a VIP Pass'}
                </GText>
                <GText size={11.5} color={UI.muted}>
                  {passes.count} left
                  {passes.nextIn > 0 ? ` · next one in ${Math.ceil(passes.nextIn / 60000)} min` : ''}
                </GText>
              </View>
            </View>
          ) : null}

          {!passed && !demo ? (
            <GText size={12.5} color={UI.muted} align="center">
              Reach the goal to unlock the next night. Tip: seat rivals apart, and grab two of the same thing when two guests want it.
            </GText>
          ) : null}

          <View style={{ gap: 8 }}>
            {passed && hasNext && !demo ? <GameButton label="Next night" icon="next" size="lg" onPress={onNext} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <GameButton label={demo ? 'Your turn' : 'Replay'} icon={demo ? 'play' : 'retry'} tone={passed && !demo ? 'dark' : 'pink'} onPress={onReplay} style={{ flex: 1 }} />
              <GameButton label="Map" icon="map" tone="dark" onPress={onMap} style={{ flex: 1 }} />
            </View>
          </View>
        </ScrollView>
      </Panel>
    </Modal>
  );
}
