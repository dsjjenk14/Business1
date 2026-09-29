import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { effectLayers, type EffectKey } from '@/features/photos/effects';

/** Draws an effect over a video (or anything) while it plays. Touches pass through. */
export function EffectOverlay({ effect }: { effect: EffectKey | null | undefined }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const layers = effectLayers(effect);
  if (!layers.length) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {layers.map((l, i) =>
              l.type === 'radial' ? (
                <RadialGradient key={i} id={`fx${i}`} cx={l.cx * size.w} cy={l.cy * size.h} r={l.r * Math.max(size.w, size.h)} gradientUnits="userSpaceOnUse">
                  {l.stops.map(([o, c]) => (
                    <Stop key={o} offset={o} stopColor={rgb(c)} stopOpacity={alpha(c)} />
                  ))}
                </RadialGradient>
              ) : l.type === 'linear' ? (
                <LinearGradient key={i} id={`fx${i}`} x1={l.x1 * size.w} y1={l.y1 * size.h} x2={l.x2 * size.w} y2={l.y2 * size.h} gradientUnits="userSpaceOnUse">
                  {l.stops.map(([o, c]) => (
                    <Stop key={o} offset={o} stopColor={rgb(c)} stopOpacity={alpha(c)} />
                  ))}
                </LinearGradient>
              ) : null,
            )}
          </Defs>
          {layers.map((l, i) => {
            if (l.type !== 'frame') return <Rect key={i} x={0} y={0} width={size.w} height={size.h} fill={`url(#fx${i})`} />;
            const b = l.width * Math.min(size.w, size.h);
            return [
              <Rect key={`${i}t`} x={0} y={0} width={size.w} height={b} fill={rgb(l.color)} fillOpacity={alpha(l.color)} />,
              <Rect key={`${i}b`} x={0} y={size.h - b} width={size.w} height={b} fill={rgb(l.color)} fillOpacity={alpha(l.color)} />,
              <Rect key={`${i}l`} x={0} y={0} width={b} height={size.h} fill={rgb(l.color)} fillOpacity={alpha(l.color)} />,
              <Rect key={`${i}r`} x={size.w - b} y={0} width={b} height={size.h} fill={rgb(l.color)} fillOpacity={alpha(l.color)} />,
            ];
          })}
        </Svg>
      ) : null}
    </View>
  );
}

// "rgba(r,g,b,a)" → "rgb(r,g,b)" and a, since SVG stops take opacity separately.
const parts = (c: string) => c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
const rgb = (c: string) => {
  const [r, g, b] = parts(c);
  return `rgb(${r},${g},${b})`;
};
const alpha = (c: string) => parts(c)[3] ?? 1;
