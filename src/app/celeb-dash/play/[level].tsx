import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Platform, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResultsCard, PauseMenu, StoryDialog, TipCards, TipList } from '@/components/celeb-dash/Dialogs';
import { GuestCard } from '@/components/celeb-dash/GuestCard';
import { Banner, FeedTicker, PartyHud, SeatingHud } from '@/components/celeb-dash/Hud';
import type { IconName } from '@/components/celeb-dash/Icons';
import { GText, GameButton } from '@/components/celeb-dash/Parts';
import { Scene } from '@/components/celeb-dash/Scene';
import { UI } from '@/components/celeb-dash/palette';
import { TROUBLES } from '@/features/celeb-dash/engine/content';
import { botThink } from '@/features/celeb-dash/engine/bot';
import { coinsEarned, createGame, followersGained, seatGuest, selectLate, starsFor, startParty, step, tap, unseated } from '@/features/celeb-dash/engine/game';
import { WORLD } from '@/features/celeb-dash/engine/layout';
import { CHAPTERS, LEVELS_BY_ID, nextLevel } from '@/features/celeb-dash/engine/levels';
import type { GameEvent, GameState, LevelDef, Target } from '@/features/celeb-dash/engine/types';
import { buzz } from '@/features/celeb-dash/haptics';
import { getProgress, isUnlocked, markOutro, markStory, markTips, recordNight, setHaptics, useProgress } from '@/features/celeb-dash/progress';
import { useGameLoop } from '@/features/celeb-dash/useGameLoop';
import { goBackOr } from '@/lib/navigation';

/**
 * One night of Celeb Dash: the client's briefing, "new tonight" tips, the
 * seating puzzle, the party itself, then the results.
 */
export default function PlayScreen() {
  const { level, demo } = useLocalSearchParams<{ level: string; demo?: string }>();
  const def = level ? LEVELS_BY_ID[level] : undefined;
  const { loaded, progress } = useProgress();
  const [run, setRun] = useState(0);
  const router = useRouter();

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <GText font="display" size={32}>
          That night doesn’t exist
        </GText>
        <GameButton label="Back to the map" icon="map" onPress={() => router.replace('/celeb-dash')} />
      </View>
    );
  }
  if (!loaded) return <View style={{ flex: 1, backgroundColor: UI.bg }} />;
  if (demo !== '1' && !isUnlocked(progress, def.id)) {
    return (
      <View style={{ flex: 1, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <GText font="display" size={32} align="center">
          Night {def.id} is still locked
        </GText>
        <GText size={14} color={UI.muted} align="center">
          Reach the goal on the night before it first.
        </GText>
        <GameButton label="Back to the map" icon="map" onPress={() => router.replace('/celeb-dash')} />
      </View>
    );
  }
  return <Night key={`${def.id}-${run}-${demo ?? ''}`} level={def} demo={demo === '1'} onRestart={() => setRun((r) => r + 1)} />;
}

type Overlay = 'story' | 'tips' | 'none' | 'pause' | 'help' | 'results' | 'outro';
type Flash = { text: string; tone: 'live' | 'warn' | 'good' | 'info'; icon?: IconName; until: number };
type Result = { stars: number; coins: number; followers: number; newBest: boolean };

const HUD_H = 88;
const DRAW_EVERY = Platform.OS === 'web' ? 0 : 1 / 40;
const FEED_H = 52;
const TRAY_H = 214;

/** Fits the 400 × 700 board (or a slice of it) into the space available. */
function WorldView({ width, height, y0, y1, children }: { width: number; height: number; y0: number; y1: number; children: ReactNode }) {
  const scale = Math.min(width / WORLD.w, height / (y1 - y0));
  return (
    <View style={{ width: WORLD.w * scale, height: (y1 - y0) * scale, overflow: 'hidden', borderRadius: 18 }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: WORLD.w,
          height: WORLD.h,
          transform: [{ translateX: -(WORLD.w - WORLD.w * scale) / 2 }, { translateY: -(WORLD.h - WORLD.h * scale) / 2 - y0 * scale }, { scale }],
        }}>
        {children}
      </View>
    </View>
  );
}

/** The frame loop's scratch state is mutable on purpose (like the game state). */
function patch<T extends object>(target: T, values: Partial<T>) {
  Object.assign(target, values);
}

function firstName(name: string) {
  return name.split(' ')[0]?.replace(/"/g, '') ?? name;
}

/** The ongoing banner, if any: the most urgent thing in the room right now. */
function standingBanner(s: GameState): Omit<Flash, 'until'> | null {
  const host = firstName(s.chapter.client.name);
  if (s.live.state === 'warning') return { text: `${host} goes LIVE in ${Math.ceil(s.live.timer)}. Tap the stage!`, tone: 'live', icon: 'live' };
  if (s.live.state === 'setup') return { text: 'Setting up the stream…', tone: 'live', icon: 'live' };
  if (s.live.state === 'onair') return { text: `${host} is LIVE. Nobody loses patience`, tone: 'live', icon: 'live' };
  if (s.troubles.some((t) => t.kind === 'wifi' && t.active)) return { text: 'Wi-Fi is down. Tap the router!', tone: 'warn', icon: 'wifi' };
  if (s.selected) return { text: 'Now tap an empty seat', tone: 'info', icon: 'seat' };
  const late = s.lateQueue[0] ? s.guests.find((g) => g.id === s.lateQueue[0]) : undefined;
  if (late) return { text: `${firstName(late.profile.name)} is at the rope. Tap them, then a seat`, tone: 'info', icon: 'late' };
  if (s.viral > 0) return { text: 'GOING VIRAL: double clout!', tone: 'good', icon: 'rocket' };
  return null;
}

function Night({ level, demo, onRestart }: { level: LevelDef; demo: boolean; onRestart: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress } = useProgress();
  const [s] = useState<GameState>(() => createGame(level, getProgress().upgrades, Math.floor(Math.random() * 1e9)));
  const [tips] = useState(() => level.tips.filter((t) => !getProgress().seenTips.includes(t)));
  const [overlay, setOverlay] = useState<Overlay>(() => {
    if (demo) return 'none';
    if (level.index === 1 && !getProgress().seenStory.includes(level.chapter)) return 'story';
    return tips.length ? 'tips' : 'none';
  });
  const [selected, setSelected] = useState<string | null>(() => unseated(s)[0]?.id ?? null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [, setFrame] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // Mutable per-night UI state that the frame loop writes, next to the game state itself.
  const [night] = useState<{ flash: Flash | null; finished: boolean; botWait: number; sinceDraw: number }>(() => ({ flash: null, finished: false, botWait: 2.5, sinceDraw: 0 }));

  const say = (text: string, tone: Flash['tone'], icon?: IconName, seconds = 2.2) => {
    patch(night, { flash: { text, tone, icon, until: s.clock + seconds } });
  };

  const react = (e: GameEvent) => {
    switch (e.kind) {
      case 'serve':
        buzz.light();
        break;
      case 'wrong':
        buzz.warning();
        break;
      case 'handsFull':
        buzz.select();
        say('Hands full. Serve or recycle something first', 'warn', 'tote', 1.6);
        break;
      case 'queueFull':
        say('Kiki has six things queued. Let her catch up', 'warn', 'clock', 1.6);
        break;
      case 'unfollow': {
        buzz.error();
        const g = s.guests.find((x) => x.id === e.guest);
        if (g) say(`${g.profile.handle} unfollowed the party`, 'warn', 'heartEmpty');
        break;
      }
      case 'trouble':
        buzz.medium();
        if (e.trouble !== 'wifi') say(`${TROUBLES[e.trouble].label}! Tap to ${TROUBLES[e.trouble].fix.toLowerCase()}`, 'warn', e.trouble === 'spill' ? 'spill' : e.trouble);
        break;
      case 'fixed':
        buzz.light();
        break;
      case 'liveWarning':
        buzz.heavy();
        break;
      case 'liveStart':
        buzz.success();
        break;
      case 'liveMissed':
        buzz.error();
        say('Missed the live. Everyone lost a heart', 'warn', 'live');
        break;
      case 'viral':
        buzz.success();
        break;
      case 'late':
        buzz.medium();
        break;
      case 'streak':
        if (e.n >= 3) buzz.select();
        break;
      default:
        break;
    }
  };

  const finish = () => {
    patch(night, { finished: true });
    const stars = starsFor(level, s.score);
    const coins = coinsEarned(s.score, stars);
    const followers = followersGained(s.score, stars);
    if (demo) {
      // Demo nights are for watching; they don't count.
      setResult({ stars, coins: 0, followers: 0, newBest: false });
      setOverlay('results');
      return;
    }
    const r = recordNight(level.id, {
      score: s.score,
      stars,
      coins,
      followers,
      served: s.stats.served,
      unfollows: s.stats.unfollows,
      bestStreak: s.streak.best,
      lives: s.stats.lives,
    });
    setResult({ stars, coins, followers, newBest: r.newBest });
    if (stars > 0) buzz.success();
    else buzz.warning();
    setOverlay('results');
  };

  const running = overlay === 'none' && !result;
  useGameLoop(running, (dt) => {
    if (demo) {
      patch(night, { botWait: night.botWait - dt });
      if (night.botWait <= 0) {
        botThink(s);
        patch(night, { botWait: 0.3 });
      }
    }
    step(s, dt);
    if (s.events.length) s.events.splice(0).forEach(react);
    if (s.phase === 'done' && !night.finished) finish();
    // The simulation steps every display frame; phones redraw at up to 40 fps to save battery.
    patch(night, { sinceDraw: night.sinceDraw + dt });
    if (night.sinceDraw >= DRAW_EVERY) {
      patch(night, { sinceDraw: 0 });
      setFrame((f) => (f + 1) % 1_000_000);
    }
  });

  // Android back button pauses instead of walking out mid-night.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay === 'results' || overlay === 'outro') return false;
      setOverlay(overlay === 'pause' ? 'none' : overlay === 'none' ? 'pause' : overlay);
      return true;
    });
    return () => sub.remove();
  }, [overlay]);

  // Pause when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') setOverlay((o) => (o === 'none' ? 'pause' : o));
    });
    return () => sub.remove();
  }, []);

  const seating = s.phase === 'seating';

  const onSeat = (seatId: number) => {
    if (seating) {
      const seat = s.seats[seatId];
      if (!seat) return;
      if (selected && seat.guest === selected) {
        setSelected(null);
        return;
      }
      if (selected) {
        seatGuest(s, selected, seatId);
        buzz.select();
        setSelected(unseated(s)[0]?.id ?? null);
      } else if (seat.guest) {
        buzz.select();
        setSelected(seat.guest);
      }
      setFrame((f) => f + 1);
      return;
    }
    if (tap(s, { kind: 'seat', seat: seatId })) buzz.select();
  };
  const onTap = (target: Target) => {
    if (tap(s, target)) buzz.select();
  };
  const onLate = (id: string) => {
    selectLate(s, id);
    buzz.select();
  };
  const openDoors = () => {
    startParty(s);
    setSelected(null);
    buzz.medium();
    say('Doors are open!', 'good', 'play', 1.6);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - area.w) > 1 || Math.abs(height - area.h) > 1) setArea({ w: width, h: height });
  };

  const banner =
    night.flash && s.clock < night.flash.until
      ? night.flash
      : (standingBanner(s) ?? (demo ? { text: 'Demo night: Kiki is on autopilot', tone: 'info' as const, icon: 'phone' as const } : null));
  const next = nextLevel(level.id);
  const lastOfChapter = !next || next.chapter !== level.chapter;
  const leave = () => goBackOr(router, '/celeb-dash');
  const goNext = () => {
    if (next) router.replace({ pathname: '/celeb-dash/play/[level]', params: { level: next.id } });
    else leave();
  };
  const trayGuests = [...unseated(s), ...s.guests.filter((g) => !g.late && g.seat >= 0)];

  return (
    <View style={{ flex: 1, backgroundColor: UI.bgDeep, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 6) }}>
      <View style={{ height: HUD_H, justifyContent: 'center' }}>
        {seating ? (
          <SeatingHud s={s} seatedAll={unseated(s).length === 0} onStart={openDoors} onPause={() => setOverlay('pause')} />
        ) : (
          <PartyHud s={s} onPause={() => setOverlay('pause')} />
        )}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
        {area.w > 0 ? (
          <WorldView width={area.w - 8} height={area.h - 4} y0={0} y1={seating ? 600 : WORLD.h}>
            <Scene s={s} selected={seating ? selected : s.selected} onSeat={onSeat} onTap={onTap} onLate={onLate} />
          </WorldView>
        ) : null}
      </View>

      {seating ? (
        <View style={{ height: TRAY_H, paddingTop: 8 }}>
          <GText font="bold" size={11} color={UI.muted} style={{ paddingHorizontal: 14, marginBottom: 6 }}>
            {selected
              ? `Seating ${s.guests.find((g) => g.id === selected)?.profile.name ?? ''}: tap a seat. Hearts show how happy they'd be there.`
              : unseated(s).length
                ? 'Tap a guest, then a seat.'
                : 'Everyone has a seat. Tap a guest to move them, or open the doors.'}
          </GText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 6, alignItems: 'flex-start' }}>
            {trayGuests.map((g) => (
              <GuestCard
                key={g.id}
                profile={g.profile}
                selected={selected === g.id}
                seatedHearts={g.seat >= 0 ? g.mood : null}
                onPress={() => {
                  buzz.select();
                  setSelected(selected === g.id ? null : g.id);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={{ height: FEED_H, justifyContent: 'center' }}>
          {/* Urgent news takes over the feed bar, so nothing covers the room. */}
          {banner ? <Banner text={banner.text} tone={banner.tone} icon={banner.icon} /> : <FeedTicker feed={s.feed} />}
        </View>
      )}

      {overlay === 'story' ? (
        <StoryDialog
          chapter={s.chapter}
          lines={s.chapter.intro}
          kikiLine="Leave it to me. Doors open in five."
          onDone={() => {
            markStory(level.chapter);
            setOverlay(tips.length ? 'tips' : 'none');
          }}
        />
      ) : null}
      {overlay === 'tips' ? (
        <TipCards
          tips={tips}
          onDone={() => {
            markTips(tips);
            setOverlay('none');
          }}
        />
      ) : null}
      {overlay === 'pause' ? (
        <PauseMenu
          level={level}
          haptics={progress.haptics}
          onResume={() => setOverlay('none')}
          onRestart={onRestart}
          onQuit={leave}
          onHaptics={() => setHaptics(!progress.haptics)}
          onTips={() => setOverlay('help')}
        />
      ) : null}
      {overlay === 'help' ? <TipList onClose={() => setOverlay('pause')} /> : null}
      {overlay === 'results' && result ? (
        <ResultsCard
          level={level}
          chapter={s.chapter}
          score={s.score}
          stars={result.stars}
          breakdown={s.breakdown}
          stats={{ served: s.stats.served, unfollows: s.stats.unfollows, troubles: s.stats.troubles, bestStreak: s.streak.best, lives: s.stats.lives, missedLives: s.live.missed }}
          coins={result.coins}
          followers={result.followers}
          kikiFollowers={progress.followers}
          newBest={result.newBest}
          hasNext={!!next}
          onNext={() => {
            if (lastOfChapter && result.stars > 0 && !getProgress().seenOutro.includes(level.chapter)) setOverlay('outro');
            else goNext();
          }}
          demo={demo}
          onReplay={demo ? () => router.replace({ pathname: '/celeb-dash/play/[level]', params: { level: level.id } }) : onRestart}
          onMap={() => {
            if (lastOfChapter && result.stars > 0 && !getProgress().seenOutro.includes(level.chapter)) setOverlay('outro');
            else leave();
          }}
        />
      ) : null}
      {overlay === 'outro' ? (
        <StoryDialog
          chapter={s.chapter}
          lines={[s.chapter.outro]}
          kikiLine={next ? `Thank you! Next stop: ${CHAPTERS[next.chapter - 1]?.title ?? 'the next venue'}.` : 'Planner of the Year. I could get used to this.'}
          finale
          onDone={() => {
            markOutro(level.chapter);
            goNext();
          }}
        />
      ) : null}
    </View>
  );
}
