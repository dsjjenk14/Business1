import { memo, type ReactNode } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { Look, VenueId } from '@/features/in-crowd/engine/types';

import { BustArt } from './Avatar';
import { VENUES } from './palette';

const W = 400;
const H = 700;
const WALL = 98;
const INK = '#1B1426';

// Deterministic sprinkle positions so backdrops never shimmer between renders.
function sprinkle(n: number, seed: number, w: number, h: number, y0 = 0): { x: number; y: number; r: number }[] {
  const out = [];
  let a = seed;
  const rnd = () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
  for (let i = 0; i < n; i++) out.push({ x: rnd() * w, y: y0 + rnd() * h, r: 0.4 + rnd() * 1.2 });
  return out;
}

function Rooftop() {
  const v = VENUES.rooftop;
  return (
    <G>
      <Defs>
        <LinearGradient id="rt-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6A4C93" />
          <Stop offset="0.45" stopColor={v.wallTop} />
          <Stop offset="1" stopColor={v.wallBottom} />
        </LinearGradient>
        <RadialGradient id="rt-sun" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF3B0" />
          <Stop offset="1" stopColor="#FFB347" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={WALL} fill="url(#rt-sky)" />
      <Circle cx={300} cy={78} r={46} fill="url(#rt-sun)" />
      <Circle cx={300} cy={80} r={18} fill="#FFE29A" />
      {/* Skyline */}
      {[
        [0, 60, 34],
        [30, 44, 26],
        [54, 66, 30],
        [84, 30, 22],
        [104, 54, 40],
        [142, 38, 24],
        [164, 70, 28],
        [190, 50, 36],
        [224, 34, 22],
        [244, 58, 30],
        [272, 42, 26],
        [296, 64, 24],
        [318, 36, 34],
        [350, 56, 26],
        [374, 46, 30],
      ].map(([x, h, w], i) => (
        <G key={i}>
          <Rect x={x} y={WALL - (h as number)} width={w} height={h} fill={i % 2 ? '#3D2C5E' : '#4A3570'} />
          {Array.from({ length: Math.floor((h as number) / 10) }, (_, j) => (
            <Rect key={j} x={(x as number) + 4 + (j % 2) * 8} y={WALL - (h as number) + 5 + j * 9} width={3} height={3} fill="#FFD166" opacity={(i + j) % 3 ? 0.75 : 0.25} />
          ))}
        </G>
      ))}
      {/* Glass railing */}
      <Rect x={0} y={WALL - 22} width={W} height={22} fill="#FFFFFF" opacity={0.16} />
      <Line x1={0} y1={WALL - 22} x2={W} y2={WALL - 22} stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />
      {/* Deck */}
      <Rect x={0} y={WALL} width={W} height={H - WALL} fill={v.floorA} />
      {Array.from({ length: 22 }, (_, i) => (
        <G key={i}>
          <Rect x={0} y={WALL + i * 28} width={W} height={14} fill={v.floorB} opacity={0.55} />
          <Line x1={((i * 97) % 300) + 40} y1={WALL + i * 28} x2={((i * 97) % 300) + 40} y2={WALL + i * 28 + 28} stroke="#7A5233" strokeWidth={1} opacity={0.5} />
          <Line x1={0} y1={WALL + i * 28} x2={W} y2={WALL + i * 28} stroke="#7A5233" strokeWidth={0.8} opacity={0.4} />
        </G>
      ))}
      {/* String lights */}
      {[0, 1].map((k) => {
        const y0 = 104 + k * 6;
        return (
          <G key={k}>
            <Path d={`M0 ${y0} Q100 ${y0 + 30} 200 ${y0} Q300 ${y0 + 30} 400 ${y0}`} stroke="#3B2A2C" strokeWidth={1} fill="none" />
            {Array.from({ length: 16 }, (_, i) => {
              const x = 12 + i * 25;
              const t = (x % 200) / 200;
              return <Circle key={i} cx={x} cy={y0 + 60 * t * (1 - t) + 3} r={2.6} fill={['#FFE29A', '#FFB3D1', '#9BE7FF'][(i + k) % 3]} opacity={0.95} />;
            })}
          </G>
        );
      })}
      {/* Planters */}
      {[8, 392].map((x) => (
        <G key={x}>
          <Rect x={x - 8} y={300} width={16} height={260} rx={4} fill="#5A4144" />
          {Array.from({ length: 12 }, (_, i) => (
            <Circle key={i} cx={x + (i % 2 ? 3 : -3)} cy={305 + i * 21} r={9} fill={i % 2 ? '#2D6A4F' : '#40916C'} />
          ))}
        </G>
      ))}
    </G>
  );
}

function Villa() {
  const v = VENUES.villa;
  return (
    <G>
      <Rect x={0} y={0} width={W} height={WALL} fill={v.wallTop} />
      {/* Roof tiles */}
      <Rect x={0} y={0} width={W} height={12} fill="#C8553D" />
      {Array.from({ length: 21 }, (_, i) => (
        <Path key={i} d={`M${i * 20} 12 q10 8 20 0`} fill="#A63D2A" />
      ))}
      {/* Arches with sky */}
      {[60, 200, 340].map((x) => (
        <G key={x}>
          <Path d={`M${x - 34} ${WALL} V48 a34 34 0 0 1 68 0 V${WALL}z`} fill="#9BE7FF" />
          <Path d={`M${x - 34} 80 h68 V${WALL} h-68z`} fill="#00BBF9" opacity={0.6} />
          <Path d={`M${x - 34} ${WALL} V48 a34 34 0 0 1 68 0 V${WALL}`} fill="none" stroke="#E0D2BD" strokeWidth={4} />
        </G>
      ))}
      {/* Bougainvillea */}
      {sprinkle(70, 7, W, 30, 12).map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y + (i % 3) * 3} r={p.r * 2.4} fill={i % 4 ? '#F15BB5' : '#2D6A4F'} opacity={0.9} />
      ))}
      {/* Travertine floor */}
      <Rect x={0} y={WALL} width={W} height={H - WALL} fill={v.floorA} />
      {Array.from({ length: 13 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => (
          <Rect key={`${r}-${c}`} x={c * 50 + (r % 2) * 25 - 25} y={WALL + r * 48} width={49} height={47} fill={(r + c) % 2 ? v.floorB : v.floorA} stroke="#CDBA9C" strokeWidth={0.8} />
        )),
      )}
      {/* Palms in the corners */}
      {[
        [0, 120, 1],
        [400, 120, -1],
      ].map(([x, y, d]) => (
        <G key={x} transform={`translate(${x} ${y}) scale(${d} 1)`}>
          {[0, 1, 2, 3].map((i) => (
            <Path key={i} d={`M0 ${i * 14} q30 ${-10 + i * 6} 56 ${8 + i * 10} q-28 ${-4 + i * 2} -56 ${-2 + i * 4}z`} fill={i % 2 ? '#2D6A4F' : '#52B788'} />
          ))}
        </G>
      ))}
    </G>
  );
}

function Studio() {
  const v = VENUES.studio;
  return (
    <G>
      <Defs>
        <LinearGradient id="st-wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={v.wallTop} />
          <Stop offset="1" stopColor={v.wallBottom} />
        </LinearGradient>
        <LinearGradient id="st-floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#24124A" />
          <Stop offset="1" stopColor={v.floorA} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={WALL} fill="url(#st-wall)" />
      {/* Acoustic foam */}
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 20 }, (_, c) => (
          <Path key={`${r}-${c}`} d={`M${c * 20} ${r * 18} l10 16 l10 -16z`} fill={(r + c) % 2 ? '#22134A' : '#2A1859'} opacity={0.9} />
        )),
      )}
      {/* Neon strips */}
      <Rect x={0} y={4} width={W} height={2.5} fill="#FF2E88" opacity={0.9} />
      <Rect x={0} y={WALL - 6} width={W} height={2.5} fill="#00E0FF" opacity={0.9} />
      {/* Floor with neon reflections */}
      <Rect x={0} y={WALL} width={W} height={H - WALL} fill="url(#st-floor)" />
      {Array.from({ length: 14 }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={WALL + i * 44} x2={W} y2={WALL + i * 44} stroke="#3B2470" strokeWidth={1} />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <Line key={`v${i}`} x1={i * 40} y1={WALL} x2={i * 40 + (i - 5) * 30} y2={H} stroke="#3B2470" strokeWidth={1} />
      ))}
      <Path d="M0 300 L400 220" stroke="#FF2E88" strokeWidth={14} opacity={0.06} />
      <Path d="M0 520 L400 420" stroke="#00E0FF" strokeWidth={18} opacity={0.05} />
    </G>
  );
}

function Festival() {
  const v = VENUES.festival;
  return (
    <G>
      <Defs>
        <LinearGradient id="fe-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={v.wallTop} />
          <Stop offset="1" stopColor={v.wallBottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={WALL} fill="url(#fe-sky)" />
      {sprinkle(60, 3, W, 70).map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#FFFFFF" opacity={0.8} />
      ))}
      {/* Main stage in the distance, with lasers */}
      <Path d="M140 98 L160 60 H240 L260 98z" fill="#0A0A1A" />
      {[
        ['#FF2E88', -60],
        ['#00E0FF', -20],
        ['#7CF29C', 20],
        ['#FFD166', 60],
      ].map(([c, dx], i) => (
        <Path key={i} d={`M200 62 L${200 + (dx as number) * 4} 0 L${200 + (dx as number) * 4 + 8} 0z`} fill={c as string} opacity={0.45} />
      ))}
      {/* Tent valance */}
      {Array.from({ length: 10 }, (_, i) => (
        <Path key={i} d={`M${i * 40} 0 h40 v14 q-20 14 -40 0z`} fill={i % 2 ? '#F4E3C1' : '#E9C46A'} />
      ))}
      {/* Turf with rugs */}
      <Rect x={0} y={WALL} width={W} height={H - WALL} fill={v.floorA} />
      {sprinkle(260, 11, W, H - WALL, WALL).map((p, i) => (
        <Line key={i} x1={p.x} y1={p.y} x2={p.x + (i % 2 ? 1.5 : -1.5)} y2={p.y - 5} stroke={i % 3 ? '#3E7A4B' : '#244C2E'} strokeWidth={1} />
      ))}
      {[
        [102, 236],
        [298, 236],
        [102, 386],
        [298, 386],
        [102, 536],
        [298, 536],
      ].map(([x, y], i) => (
        <G key={i}>
          <Rect x={(x as number) - 90} y={(y as number) - 50} width={180} height={104} rx={4} fill={i % 2 ? '#7B2D26' : '#264653'} opacity={0.85} />
          <Rect x={(x as number) - 82} y={(y as number) - 42} width={164} height={88} rx={2} fill="none" stroke="#E9C46A" strokeWidth={2} strokeDasharray="6 4" opacity={0.7} />
        </G>
      ))}
      {/* Fairy lights */}
      {[140, 300, 460].map((y) => (
        <G key={y}>
          <Path d={`M0 ${y} Q200 ${y + 26} 400 ${y}`} stroke="#2B1D14" strokeWidth={0.8} fill="none" opacity={0.6} />
          {Array.from({ length: 20 }, (_, i) => {
            const x = 10 + i * 20;
            const t = x / 400;
            return <Circle key={i} cx={x} cy={y + 52 * t * (1 - t) + 2} r={1.8} fill="#FFE29A" opacity={0.9} />;
          })}
        </G>
      ))}
    </G>
  );
}

function Gala() {
  const v = VENUES.gala;
  return (
    <G>
      <Defs>
        <LinearGradient id="ga-wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A2414" />
          <Stop offset="1" stopColor={v.wallBottom} />
        </LinearGradient>
        <RadialGradient id="ga-pool" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFE9A8" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFE9A8" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={WALL} fill="url(#ga-wall)" />
      {/* Step-and-repeat: little golden phones */}
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 10 }, (_, c) => (
          <G key={`${r}-${c}`} transform={`translate(${c * 40 + (r % 2) * 20 + 6} ${r * 24 + 6})`}>
            <Rect x={0} y={0} width={8} height={13} rx={1.6} fill="none" stroke="#C9A227" strokeWidth={1} opacity={0.6} />
            <Circle cx={4} cy={11} r={0.7} fill="#C9A227" opacity={0.6} />
          </G>
        )),
      )}
      {/* Columns */}
      {[0, 388].map((x) => (
        <G key={x}>
          <Rect x={x} y={0} width={12} height={WALL} fill="#C9A227" />
          <Rect x={x + 3} y={0} width={2} height={WALL} fill="#F5D77A" opacity={0.7} />
        </G>
      ))}
      {/* Black marble */}
      <Rect x={0} y={WALL} width={W} height={H - WALL} fill={v.floorA} />
      {Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => (
          <Rect key={`${r}-${c}`} x={c * 70 - 10} y={WALL + r * 70} width={69} height={69} fill={(r + c) % 2 ? v.floorB : v.floorA} />
        )),
      )}
      {[
        'M0 180 q60 -20 120 30 t140 10 t140 -40',
        'M0 420 q80 30 160 -10 t120 40 t120 -20',
        'M40 620 q60 -40 140 -10 t200 -30',
      ].map((d, i) => (
        <Path key={i} d={d} stroke="#3A3A42" strokeWidth={1.4} fill="none" opacity={0.8} />
      ))}
      {/* Red carpet down the middle aisle */}
      <Rect x={184} y={WALL} width={32} height={H - WALL} fill="#9B111E" />
      <Rect x={184} y={WALL} width={3} height={H - WALL} fill="#C9A227" />
      <Rect x={213} y={WALL} width={3} height={H - WALL} fill="#C9A227" />
      {/* Chandelier light pools */}
      {[
        [200, 180],
        [100, 330],
        [300, 330],
        [200, 480],
      ].map(([x, y], i) => (
        <Ellipse key={i} cx={x} cy={y} rx={150} ry={90} fill="url(#ga-pool)" />
      ))}
    </G>
  );
}

const BACKDROPS: Record<VenueId, () => ReactNode> = { rooftop: Rooftop, villa: Villa, studio: Studio, festival: Festival, gala: Gala };

/** The whole room, drawn once per night. */
export const VenueBackdrop = memo(function VenueBackdrop({ venue, width = W, crop }: { venue: VenueId; width?: number; crop?: { y: number; h: number } }) {
  const Art = BACKDROPS[venue];
  const y = crop?.y ?? 0;
  const h = crop?.h ?? H;
  return (
    <Svg width={width} height={(width * h) / W} viewBox={`0 ${y} ${W} ${h}`}>
      <Art />
      {/* Baseboard under the counters */}
      <Rect x={0} y={WALL - 2} width={W} height={4} fill="#000000" opacity={0.3} />
    </Svg>
  );
});

/** What fills a table slot nobody is using tonight. 176 × 120. */
export const SlotDecor = memo(function SlotDecor({ venue, slot }: { venue: VenueId; slot: number }) {
  let art: ReactNode;
  switch (venue) {
    case 'rooftop':
      art = (
        <G>
          <Rect x={30} y={30} width={116} height={36} rx={14} fill="#F1DCCB" stroke={INK} strokeWidth={1} />
          <Rect x={24} y={52} width={128} height={30} rx={12} fill="#FFF4EA" stroke={INK} strokeWidth={1} />
          {[44, 76, 108].map((x, i) => (
            <Rect key={x} x={x} y={38} width={24} height={18} rx={6} fill={['#FF6F91', '#FFC371', '#9BE7FF'][i]} stroke={INK} strokeWidth={0.6} />
          ))}
          <Ellipse cx={88} cy={102} rx={26} ry={8} fill="#3B2A2C" />
          <Path d="M76 100c2-10 8-8 6-16 6 4 10 8 8 16 4-4 4-8 2-12 6 4 8 10 4 12z" fill="#FF8A5B" />
          <Path d="M82 100c1-5 4-4 3-8 3 2 5 4 4 8z" fill="#FFD166" />
        </G>
      );
      break;
    case 'villa':
      art = (
        <G>
          <Rect x={8} y={14} width={160} height={92} rx={18} fill="#E0D2BD" />
          <Rect x={14} y={20} width={148} height={80} rx={14} fill="#00BBF9" />
          <Path d="M24 50 q20 -8 40 0 t40 0 t40 0" stroke="#9BE7FF" strokeWidth={2} fill="none" />
          <Path d="M24 74 q20 -8 40 0 t40 0 t40 0" stroke="#9BE7FF" strokeWidth={2} fill="none" />
          <Circle cx={slot % 2 ? 60 : 116} cy={58} r={16} fill="none" stroke="#FF6F91" strokeWidth={9} />
          <Circle cx={slot % 2 ? 60 : 116} cy={58} r={16} fill="none" stroke="#FFFFFF" strokeWidth={9} strokeDasharray="8 8" />
          <Path d={`M${slot % 2 ? 108 : 40} 70 l14 -10 l14 10 l-14 10z`} fill="#FFD166" stroke={INK} strokeWidth={0.6} />
        </G>
      );
      break;
    case 'studio':
      art = (
        <G>
          <Rect x={20} y={46} width={136} height={34} rx={6} fill="#0B0718" stroke="#FF2E88" strokeWidth={1.4} />
          {[48, 88, 128].map((x) => (
            <G key={x}>
              <Line x1={x} y1={46} x2={x} y2={22} stroke="#9CA3AF" strokeWidth={2} />
              <Rect x={x - 6} y={8} width={12} height={18} rx={6} fill="#2D3142" stroke="#00E0FF" strokeWidth={1} />
            </G>
          ))}
          <Rect x={62} y={86} width={52} height={22} rx={4} fill="#FF2E88" />
          <SvgText x={88} y={101} fontSize={11} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
            ON AIR
          </SvgText>
        </G>
      );
      break;
    case 'festival':
      art = (
        <G>
          {[20, 70, 120].map((x, i) => (
            <G key={x}>
              <Rect x={x} y={56 - (i % 2) * 6} width={40} height={26} rx={3} fill="#E9C46A" stroke="#B5892E" strokeWidth={1} />
              <Path d={`M${x} ${66 - (i % 2) * 6}h40M${x} ${74 - (i % 2) * 6}h40`} stroke="#B5892E" strokeWidth={0.8} />
            </G>
          ))}
          <Rect x={60} y={6} width={56} height={46} rx={4} fill="#111827" stroke="#374151" strokeWidth={1} />
          <Circle cx={88} cy={22} r={9} fill="#1F2937" stroke="#4B5563" strokeWidth={2} />
          <Circle cx={88} cy={42} r={6} fill="#1F2937" stroke="#4B5563" strokeWidth={2} />
          <Rect x={30} y={90} width={116} height={14} rx={7} fill="#E76F51" opacity={0.8} />
        </G>
      );
      break;
    case 'gala':
      art = (
        <G>
          <Ellipse cx={88} cy={104} rx={44} ry={8} fill="#000" opacity={0.4} />
          <Rect x={66} y={70} width={44} height={34} rx={3} fill="#2A2414" stroke="#C9A227" strokeWidth={1.4} />
          <Rect x={72} y={8} width={32} height={58} rx={6} fill="#C9A227" stroke="#8C6D12" strokeWidth={1.4} />
          <Rect x={76} y={14} width={24} height={44} rx={3} fill="#F5D77A" />
          <Circle cx={88} cy={62} r={2} fill="#8C6D12" />
          {[24, 152].map((x) => (
            <G key={x}>
              <Rect x={x - 3} y={60} width={6} height={44} fill="#C9A227" />
              <Circle cx={x} cy={58} r={5} fill="#F5D77A" />
            </G>
          ))}
          <Path d="M24 64 q32 22 42 10M152 64 q-32 22 -42 10" stroke="#9B111E" strokeWidth={5} fill="none" strokeLinecap="round" />
        </G>
      );
      break;
  }
  return (
    <Svg width={176} height={120} viewBox="0 0 176 120" opacity={0.95}>
      <Ellipse cx={88} cy={110} rx={70} ry={6} fill="#000" opacity={0.12} />
      {art}
    </Svg>
  );
});

// ─── Front of house ───────────────────────────────────────────────────────

/** The velvet rope where late guests wait. 70 × 100. */
export const Entrance = memo(function Entrance({ venue }: { venue: VenueId }) {
  const v = VENUES[venue];
  return (
    <Svg width={70} height={100} viewBox="0 0 70 100">
      <Rect x={4} y={80} width={62} height={16} rx={3} fill="#9B111E" opacity={0.85} />
      <Rect x={9} y={30} width={6} height={56} rx={2} fill="#D4A017" />
      <Rect x={55} y={30} width={6} height={56} rx={2} fill="#D4A017" />
      <Circle cx={12} cy={28} r={5} fill="#FFD166" stroke="#B7791F" strokeWidth={0.8} />
      <Circle cx={58} cy={28} r={5} fill="#FFD166" stroke="#B7791F" strokeWidth={0.8} />
      <Path d="M14 36c10 16 32 16 42 0" stroke="#9B111E" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Rect x={14} y={2} width={42} height={16} rx={4} fill={v.label} stroke={INK} strokeWidth={0.8} />
      <SvgText x={35} y={14} fontSize={10} fontWeight="bold" fill={v.labelText} textAnchor="middle">
        VIP
      </SvgText>
    </Svg>
  );
});

/** Recycling bins. 70 × 76. */
export const Bins = memo(function Bins() {
  return (
    <Svg width={70} height={76} viewBox="0 0 70 76">
      <Ellipse cx={35} cy={72} rx={30} ry={4} fill="#000" opacity={0.25} />
      {[
        [6, '#2A9D8F'],
        [37, '#3A86FF'],
      ].map(([x, c]) => (
        <G key={x}>
          <Path d={`M${x} 22h27l-3 48h-21z`} fill={c as string} stroke={INK} strokeWidth={1} />
          <Rect x={(x as number) - 2} y={16} width={31} height={8} rx={2.4} fill={c as string} stroke={INK} strokeWidth={1} />
          <Path
            d={`M${(x as number) + 13.5} 36l4 6h-8zM${(x as number) + 8} 50l-3 -5 6 0M${(x as number) + 19} 50l3 -5 -6 0`}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </G>
      ))}
    </Svg>
  );
});

/** The Wi-Fi router on its little stand. 52 × 44. */
export const Router = memo(function Router({ down, blink }: { down: boolean; blink: boolean }) {
  const led = down ? (blink ? '#FF2E4D' : '#5A0B16') : '#7CF29C';
  return (
    <Svg width={52} height={44} viewBox="0 0 52 44">
      <Rect x={6} y={30} width={40} height={12} rx={2} fill="#4A3423" />
      <Rect x={8} y={18} width={36} height={13} rx={3} fill="#1F2937" stroke={INK} strokeWidth={1} />
      <Line x1={14} y1={18} x2={10} y2={2} stroke="#1F2937" strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={38} y1={18} x2={42} y2={2} stroke="#1F2937" strokeWidth={2.4} strokeLinecap="round" />
      {[16, 22, 28, 34].map((x, i) => (
        <Circle key={x} cx={x} cy={25} r={1.8} fill={i === 3 && !down ? '#FFD166' : led} />
      ))}
    </Svg>
  );
});

/** The live stage. 120 × 96. The host appears on it when it's time. */
export const Stage = memo(function Stage({ state, host, hostId, pulse }: { state: 'idle' | 'warning' | 'setup' | 'onair'; host: Look; hostId: string; pulse: boolean }) {
  const lit = state === 'onair';
  const warn = state === 'warning' || state === 'setup';
  return (
    <Svg width={120} height={96} viewBox="0 0 120 96">
      <Defs>
        <RadialGradient id="stage-glow" cx="0.5" cy="0.6" r="0.6">
          <Stop offset="0" stopColor="#FF2E4D" stopOpacity={lit ? 0.55 : warn && pulse ? 0.35 : 0} />
          <Stop offset="1" stopColor="#FF2E4D" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={60} cy={60} rx={60} ry={36} fill="url(#stage-glow)" />
      {/* Platform */}
      <Path d="M8 72h104l-6 20H14z" fill="#2D3142" stroke={INK} strokeWidth={1} />
      <Rect x={4} y={64} width={112} height={10} rx={3} fill="#4F5D75" stroke={INK} strokeWidth={1} />
      {[16, 36, 56, 76, 96].map((x) => (
        <Circle key={x} cx={x + 4} cy={80} r={2} fill={lit || (warn && pulse) ? '#FFD166' : '#6B7280'} />
      ))}
      {/* Ring light on a stand */}
      <Line x1={96} y1={30} x2={96} y2={64} stroke="#3A3A44" strokeWidth={2} />
      <Circle cx={96} cy={22} r={10} fill="none" stroke={lit ? '#FFFFFF' : '#FFF7D6'} strokeWidth={4} opacity={lit ? 1 : 0.7} />
      {/* Phone on a tripod */}
      <Path d="M22 64l6-22 6 22M28 42v22" stroke="#3A3A44" strokeWidth={1.6} fill="none" />
      <Rect x={22} y={26} width={12} height={18} rx={2} fill="#111827" stroke={INK} strokeWidth={0.6} />
      <Rect x={23.5} y={28} width={9} height={13} rx={1} fill={lit ? '#FF2E4D' : '#374151'} />
      {/* Host */}
      {lit || warn ? (
        <G transform="translate(42 6) scale(0.82)">
          <BustArt look={host} expr={lit ? 'happy' : 'ok'} id={`stage-${hostId}`} />
        </G>
      ) : null}
      {/* LIVE sign */}
      <Rect x={38} y={74} width={44} height={14} rx={3} fill={lit ? '#FF2E4D' : warn && pulse ? '#B3123A' : '#3A3A44'} />
      <SvgText x={60} y={85} fontSize={10} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        LIVE
      </SvgText>
    </Svg>
  );
});
