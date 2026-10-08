import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

/** Instagram-style story colors, warmed toward the app's red. */
const STORY_GRADIENT = ['#FCAF45', '#F56040', '#D62828', '#C13584'] as const;

/**
 * The ring around someone's Out bubble: a gradient when there's something new
 * to see, a thin gray ring once you've seen it all.
 */
export function StoryRing({ size, unseen, children }: { size: number; unseen: boolean; children: React.ReactNode }) {
  const t = useTheme();
  const id = `story-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = unseen ? 2.5 : 1;
  const gap = 3;
  const outer = size + (stroke + gap) * 2;
  const r = (outer - stroke) / 2;
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={outer} height={outer} style={{ position: 'absolute' }} pointerEvents="none">
        {unseen ? (
          <Defs>
            <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
              {STORY_GRADIENT.map((c, i) => (
                <Stop key={c} offset={i / (STORY_GRADIENT.length - 1)} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle cx={outer / 2} cy={outer / 2} r={r} fill="none" stroke={unseen ? `url(#${id})` : t.colors.borderStrong} strokeWidth={stroke} />
      </Svg>
      {children}
    </View>
  );
}
