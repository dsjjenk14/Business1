import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText, Button } from '@/components/ui';
import { STICKER_SIZE } from '@/components/ui/Badge';
import { celebrateMilestone, fetchPendingMilestone, FAMOUS_AT, MILESTONES } from '@/features/milestones/api';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { Confetti } from './Confetti';
import { MilestoneSticker } from './MilestoneSticker';

const LINES: Record<number, string> = {
  10: 'Ten people met you and said yes. That’s real.',
  30: 'Thirty people vouch for you. People know your name.',
  75: 'Seventy-five vouches. You’re someone people bring along.',
  100: 'One hundred vouches. Your Insiders just heard about it.',
  300: 'Three hundred people vouch for you. That’s rare.',
  500: 'Five hundred vouches. Almost nobody gets here.',
  1000: 'One thousand people met you and vouched for you. Almost nobody gets here. Your star is by your name now, and you’re in Most vouched on everyone’s Home.',
};

/**
 * When you pass a vouch milestone, the next time you open the app you get a
 * moment for it. Each one is bigger: more confetti, a bigger sticker, a longer
 * hold. 1000 is the biggest.
 */
export function MilestoneCelebration() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [m, setM] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchPendingMilestone()
        .then((next) => {
          if (live && next) {
            haptic.success();
            setM(next);
          }
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  if (!m) return null;
  return <Moment m={m} reduce={reduce} onDone={async (goTo) => {
    const shown = m;
    setM(0);
    await celebrateMilestone(shown).catch(() => undefined);
    if (goTo) router.push(goTo);
  }} />;
}

/** From 100 vouches up, the number counts up on screen before it lands. */
function useCountUp(target: number, on: boolean) {
  const [n, setN] = useState(on ? 0 : target);
  useEffect(() => {
    if (!on) return;
    const start = Date.now();
    const ms = target >= 1000 ? 1800 : 1100;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [target, on]);
  return n;
}

function Moment({ m, reduce, onDone }: { m: number; reduce: boolean; onDone: (goTo?: '/profile') => void }) {
  const t = useTheme();
  const level = MILESTONES.indexOf(m as (typeof MILESTONES)[number]); // 0..6
  const famous = m >= FAMOUS_AT;
  const confetti = reduce ? 0 : [0, 30, 50, 80, 110, 150, 220][level] ?? 0;
  const stickerSize = 120 + level * 16;
  const colors = [t.colors.primary, t.colors.secondary, t.colors.trust, t.colors.ai, '#F5F5F5'];

  const shown = useCountUp(m, m >= 100 && !reduce);
  const done = onDone;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => done()}>
      <View style={{ flex: 1, backgroundColor: famous ? 'rgba(12,12,12,0.98)' : 'rgba(12,12,12,0.94)', alignItems: 'center', justifyContent: 'center', padding: t.space[6], gap: t.space[5] }}>
        {confetti ? <Confetti count={confetti} colors={colors} duration={2200 + level * 400} /> : null}
        <View style={{ transform: [{ scale: stickerSize / STICKER_SIZE }], marginVertical: (stickerSize - STICKER_SIZE) / 2 }}>
          <MilestoneSticker count={m} />
        </View>
        <AppText variant="hero" align="center" accessibilityRole="header" style={{ color: '#F5F5F5', fontSize: famous ? 44 : 34 + level * 2, lineHeight: famous ? 48 : 40 + level * 2 }}>
          {shown.toLocaleString()} vouches
        </AppText>
        <AppText align="center" style={{ color: 'rgba(245,245,245,0.8)', maxWidth: 340 }}>
          {LINES[m]}
        </AppText>
        <View style={{ width: '100%', maxWidth: 340, gap: t.space[2] }}>
          <Button label={level >= 3 ? 'See my profile' : 'Nice'} onPress={() => done(level >= 3 ? '/profile' : undefined)} />
          {level >= 3 ? <Button label="Later" variant="ghost" onPress={() => done()} /> : null}
        </View>
      </View>
    </Modal>
  );
}
