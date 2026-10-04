import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';

import type { Dish, Look, StationKind, TroubleKind } from '@/features/in-crowd/engine/types';

import { BustArt, shade, type Expression } from './Avatar';
import { ICON_ART } from './Icons';
import type { VenuePalette } from './palette';

const INK = '#1B1426';

/** Each planner's work outfit for the walking sprite. */
export type Outfit = { blazer: [string, string, string]; lapel: string; inner: string; pants: [string, string]; sole: string; trim: string };

export const OUTFITS: Record<string, Outfit> = {
  zara: { blazer: ['#FBF3E8', '#E6D5BF', '#C9B293'], lapel: '#EFE2D2', inner: '#2A1E19', pants: ['#3A2E28', '#1F1814'], sole: '#C9A227', trim: '#C9A227' },
  kiki: { blazer: ['#3A3A46', '#1C1C24', '#0B0B10'], lapel: '#2E2E3A', inner: '#FF4D8D', pants: ['#2A2A3A', '#141420'], sole: '#FF4D8D', trim: '#FF4D8D' },
};

const PHONE_BODY: Record<string, string> = { titanium: '#9E9A93', midnight: '#23262D', pink: '#F0BFC7', gold: '#E2C48E' };
const WATCH_BAND: Record<string, string> = { midnight: '#23262D', starlight: '#E9E2D6', gold: '#D9B26B', pink: '#F2B8C6' };
const BAG_BODY: Record<string, [string, string]> = { quilted: ['#1E1E22', '#3A3A42'], monogram: ['#6B4423', '#D8B07A'], mini: ['#F4A7C0', '#FFD3E1'], croc: ['#F4F0E8', '#D9D2C4'] };

/**
 * The planner you play as, full body on a 48 × 80 grid, wearing her Closet
 * picks. `frame` swings the legs while walking; `busy` raises the phone.
 */
export const PlannerSprite = memo(function PlannerSprite({
  look,
  outfit,
  frame,
  busy,
  expr = 'happy',
  scale = 1,
}: {
  look: Look;
  outfit: Outfit;
  frame: number;
  busy: boolean;
  expr?: Expression;
  scale?: number;
}) {
  const swing = frame === 0 ? 0 : frame === 1 ? 4 : -4;
  const lf = 18 - swing * 0.6;
  const rf = 30 + swing * 0.6;
  const skinDark = shade(look.skin, 0.15);
  const gear = look.gear ?? {};
  const phone = PHONE_BODY[gear.phone ?? 'midnight'] ?? '#23262D';
  const bag = gear.bag ? BAG_BODY[gear.bag] : null;
  const o = outfit;
  // The head reuses the bust art; drop the hand-held gear there (the body holds it here).
  const headLook: Look = { ...look, gear: { headset: gear.headset } };
  return (
    <Svg width={48 * scale} height={80 * scale} viewBox="0 0 48 80">
      <Defs>
        <LinearGradient id="pl-blazer" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={o.blazer[0]} />
          <Stop offset="0.5" stopColor={o.blazer[1]} />
          <Stop offset="1" stopColor={o.blazer[2]} />
        </LinearGradient>
        <LinearGradient id="pl-pants" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={o.pants[0]} />
          <Stop offset="1" stopColor={o.pants[1]} />
        </LinearGradient>
        <LinearGradient id="pl-shoe" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D9DDE6" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={24} cy={77} rx={13} ry={3} fill="#000000" opacity={0.28} />
      {/* Legs */}
      <Path d={`M19.6 56 L${lf} 72`} stroke="url(#pl-pants)" strokeWidth={5.6} strokeLinecap="round" />
      <Path d={`M28.4 56 L${rf} 72`} stroke="url(#pl-pants)" strokeWidth={5.6} strokeLinecap="round" />
      {[lf, rf].map((x, i) => (
        <G key={i}>
          <Path d={`M${x - 4.4} 74.6C${x - 4.6} 72.4 ${x - 3} 70.6 ${x - 0.6} 70.6C${x + 1.6} 70.6 ${x + 3.2} 71.6 ${x + 4.6} 72.8C${x + 5.4} 73.4 ${x + 5.2} 74.6 ${x + 4.4} 74.6Z`} fill="url(#pl-shoe)" stroke={INK} strokeWidth={0.6} />
          <Path d={`M${x - 4.6} 74.4H${x + 4.8}V75.6C${x + 4.8} 76 ${x + 4.4} 76.4 ${x + 4} 76.4H${x - 4}C${x - 4.4} 76.4 ${x - 4.6} 76 ${x - 4.6} 75.6Z`} fill={o.sole} />
          <Path d={`M${x - 1.6} 71.8L${x + 0.4} 72.6M${x - 0.6} 71.2L${x + 1.4} 72`} stroke="#9CA3AF" strokeWidth={0.5} strokeLinecap="round" />
        </G>
      ))}
      {/* Blazer */}
      <Path d="M12.2 59C11.8 50 13.6 43.6 18 41.2L24 40.6 30 41.2C34.4 43.6 36.2 50 35.8 59 31 60.6 17 60.6 12.2 59Z" fill="url(#pl-blazer)" stroke={INK} strokeWidth={0.6} />
      <Path d="M21 41L24 48.6 27 41Z" fill={o.inner} />
      <Path d="M18 41.2L24 49 21.2 51.6 16.2 44.4Z" fill={o.lapel} stroke={INK} strokeWidth={0.4} />
      <Path d="M30 41.2L24 49 26.8 51.6 31.8 44.4Z" fill={o.lapel} stroke={INK} strokeWidth={0.4} />
      <Path d="M17.6 42.6L21.6 48" stroke="#FFFFFF" strokeWidth={0.6} opacity={0.25} strokeLinecap="round" />
      <Circle cx={24} cy={53} r={0.8} fill="#F5C542" />
      <Circle cx={24} cy={56.4} r={0.8} fill="#F5C542" />
      <Path d="M28.4 46.2L31.4 45.6 31 47.4Z" fill={o.trim} />
      {/* Staff pass on a lanyard */}
      <Path d="M20.4 41.2L19.6 49M27.6 41.2L20.4 49" stroke={o.trim} strokeWidth={0.6} />
      <Rect x={18} y={48.6} width={4.4} height={5.4} rx={0.8} fill="#FFFFFF" stroke={INK} strokeWidth={0.3} />
      <Rect x={18} y={48.6} width={4.4} height={1.6} rx={0.6} fill={o.trim} />
      {/* Crossbody bag at the right hip */}
      {bag ? (
        <G>
          <Path d="M16.6 42L34 54" stroke={gear.bag === 'quilted' ? '#E0B84F' : shade(bag[0], 0.25)} strokeWidth={0.9} strokeDasharray={gear.bag === 'quilted' ? '1 0.4' : undefined} />
          <Rect x={31.4} y={53.2} width={9.6} height={7.4} rx={1.6} fill={bag[0]} stroke={INK} strokeWidth={0.4} />
          <Path d="M31.4 55.2H41" stroke={bag[1]} strokeWidth={0.6} />
          <Rect x={35} y={54.6} width={2.4} height={1.6} rx={0.4} fill="#F5C542" />
        </G>
      ) : null}
      {/* Arms */}
      <Path d={busy ? 'M13.4 44C9.4 47 8.4 50 10.4 53' : `M13.4 44C10.4 49 10.4 53 11.4 ${57 + swing * 0.4}`} stroke="url(#pl-blazer)" strokeWidth={5.2} strokeLinecap="round" fill="none" />
      <Path d={busy ? 'M34.6 44C39.6 45 41.6 42 42.6 38' : `M34.6 44C37.6 49 37.6 53 36.6 ${57 - swing * 0.4}`} stroke="url(#pl-blazer)" strokeWidth={5.2} strokeLinecap="round" fill="none" />
      {busy ? (
        <G>
          <G transform="rotate(12 42 34)">
            <Rect x={38} y={27.4} width={9} height={13} rx={1.8} fill={phone} stroke={INK} strokeWidth={0.5} />
            <Rect x={38.8} y={28.2} width={3.4} height={3.4} rx={0.8} fill={shade(phone, 0.3)} />
            <Circle cx={39.7} cy={29.1} r={0.6} fill="#0C0D10" />
            <Circle cx={41.3} cy={29.1} r={0.6} fill="#0C0D10" />
            <Circle cx={39.7} cy={30.7} r={0.6} fill="#0C0D10" />
          </G>
          <Circle cx={41.4} cy={39} r={2.4} fill={look.skin} stroke={skinDark} strokeWidth={0.4} />
          <Circle cx={10.6} cy={53.4} r={2.2} fill={look.skin} stroke={skinDark} strokeWidth={0.4} />
          {gear.watch ? <Rect x={8.8} y={50.4} width={3.6} height={1.6} rx={0.6} fill={WATCH_BAND[gear.watch]} stroke={INK} strokeWidth={0.3} /> : null}
        </G>
      ) : (
        <G>
          <G transform={`rotate(${-8 + swing} 9 58)`}>
            <Rect x={4.6} y={52.6} width={9.4} height={12} rx={1.4} fill="#B07A4A" stroke={INK} strokeWidth={0.5} />
            <Rect x={5.8} y={55} width={7} height={8.6} rx={0.4} fill="#FFFFFF" />
            <Path d="M6.8 57.2H11.6M6.8 59H11.6M6.8 60.8H10" stroke="#C9BEDD" strokeWidth={0.5} />
            <Rect x={7.4} y={51.8} width={3.8} height={2.2} rx={0.6} fill="#D1D5DB" stroke={INK} strokeWidth={0.3} />
          </G>
          {gear.watch ? <Rect x={10} y={54} width={3.6} height={1.6} rx={0.6} fill={WATCH_BAND[gear.watch]} stroke={INK} strokeWidth={0.3} transform="rotate(-20 11.8 54.8)" /> : null}
          <Circle cx={11.6} cy={57.6} r={2.1} fill={look.skin} stroke={skinDark} strokeWidth={0.4} />
          <Circle cx={36.6} cy={57.6} r={2.1} fill={look.skin} stroke={skinDark} strokeWidth={0.4} />
        </G>
      )}
      {/* Head (the same bust art as everyone else, scaled) */}
      <G transform="translate(6.5 0) scale(0.73)">
        <BustArt look={headLook} expr={expr} id={`planner-walk-${look.hairColor.slice(1)}`} />
      </G>
    </Svg>
  );
});

// ─── Counters ─────────────────────────────────────────────────────────────

function Counter({ v, children }: { v: VenuePalette; children?: React.ReactNode }) {
  return (
    <G>
      <Rect x={2} y={38} width={60} height={30} rx={4} fill={v.counter} stroke={INK} strokeWidth={1} />
      <Rect x={0} y={34} width={64} height={7} rx={3} fill={v.counterTop} stroke={INK} strokeWidth={1} />
      <Rect x={6} y={46} width={52} height={2} rx={1} fill="#FFFFFF" opacity={0.08} />
      {children}
    </G>
  );
}

const STATION_ART: Record<StationKind, (v: VenuePalette) => React.ReactNode> = {
  kitchen: (v) => (
    <G>
      {/* Hood and shelf */}
      <Path d="M8 4h48l-6 12H14z" fill="#9AA5B1" stroke={INK} strokeWidth={1} />
      <Rect x={14} y={16} width={36} height={3} fill="#7B8794" />
      <Rect x={10} y={20} width={44} height={14} rx={2} fill="#2D3142" stroke={INK} strokeWidth={0.8} />
      {/* Burners with steam */}
      <Ellipse cx={22} cy={30} rx={7} ry={2.4} fill="#111" />
      <Ellipse cx={42} cy={30} rx={7} ry={2.4} fill="#111" />
      <Path d="M17 30h10v-5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2z" fill="#B0BEC5" stroke={INK} strokeWidth={0.6} />
      <Path d="M36 29h12l-1.5-4h-9z" fill="#37474F" stroke={INK} strokeWidth={0.6} />
      <Path d="M20 20c-2-3 2-4 0-7M25 20c-2-3 2-4 0-7" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1} fill="none" />
      <Counter v={v}>
        <Rect x={4} y={50} width={56} height={4} fill="#E5E7EB" opacity={0.35} />
        {/* Pass bell */}
        <Path d="M50 34a4 4 0 0 1 8 0z" fill="#FFD166" stroke={INK} strokeWidth={0.6} />
      </Counter>
      {/* Chef hat on a hook */}
      <Path d="M4 14c-2-.4-2.4-3-.8-3.8.8-.4 1.6-.2 2 .2.4-1.6 1.4-2.2 2.2-2.2s1.8.6 2.2 2.2c.4-.4 1.2-.6 2-.2 1.6.8 1.2 3.4-.8 3.8v2.4H4z" fill="#FFFFFF" stroke={INK} strokeWidth={0.6} />
    </G>
  ),
  bar: (v) => (
    <G>
      {/* Back shelf with bottles */}
      <Rect x={4} y={8} width={56} height={3} fill={shade(v.counterTop, 0.3)} />
      <Rect x={4} y={22} width={56} height={3} fill={shade(v.counterTop, 0.3)} />
      {[
        [8, '#FF4D8D'],
        [15, '#4CC9F0'],
        [22, '#FFD166'],
        [29, '#7CF29C'],
        [36, '#B983FF'],
        [43, '#FF8A5B'],
        [50, '#4CC9F0'],
      ].map(([x, c], i) => (
        <G key={i}>
          <Rect x={x as number} y={i % 2 ? 1 : 0} width={5} height={i % 2 ? 7 : 8} rx={1.4} fill={c as string} opacity={0.9} />
          <Rect x={(x as number) + 1.6} y={i % 2 ? -1.6 : -2.4} width={1.8} height={3} fill={c as string} />
        </G>
      ))}
      {[10, 22, 34, 46].map((x) => (
        <Path key={x} d={`M${x} 14h7l-1.2 7.4h-4.6z`} fill="#FFFFFF" opacity={0.75} stroke={INK} strokeWidth={0.4} />
      ))}
      <Counter v={v}>
        {/* Mocktails ready on the bar */}
        <Path d="M10 25h8l-1 9h-6z" fill="#FF4D8D" stroke={INK} strokeWidth={0.6} />
        <Path d="M24 26h7l-.8 8h-5.4z" fill="#FFB347" stroke={INK} strokeWidth={0.6} />
        <Path d="M38 25h8l-1 9h-6z" fill="#4CC9F0" stroke={INK} strokeWidth={0.6} />
        <Line x1={16} y1={21} x2={14.4} y2={30} stroke="#FFFFFF" strokeWidth={1} />
        <Line x1={44} y1={21} x2={42.4} y2={30} stroke="#FFFFFF" strokeWidth={1} />
        <Circle cx={50} cy={28} r={3} fill="#9BE564" stroke="#FFFFFF" strokeWidth={0.6} />
      </Counter>
    </G>
  ),
  charge: (v) => (
    <G>
      {/* Neon battery sign */}
      <Rect x={14} y={2} width={34} height={16} rx={3} fill="#0B1220" stroke="#7CF29C" strokeWidth={1.4} />
      <Rect x={48} y={7} width={3} height={6} rx={1} fill="#7CF29C" />
      <Rect x={17} y={5} width={8} height={10} rx={1} fill="#7CF29C" />
      <Rect x={27} y={5} width={8} height={10} rx={1} fill="#7CF29C" />
      <Rect x={37} y={5} width={8} height={10} rx={1} fill="#7CF29C" opacity={0.35} />
      <Counter v={v}>
        {/* Phones on the dock */}
        {[8, 20, 32, 44].map((x, i) => (
          <G key={x}>
            <Rect x={x} y={20} width={9} height={15} rx={1.6} fill="#111827" stroke={INK} strokeWidth={0.6} />
            <Rect x={x + 1.2} y={22} width={6.6} height={10} rx={0.8} fill={['#FF4D8D', '#4CC9F0', '#FFD166', '#B983FF'][i]} />
            <Path d={`M${x + 4.5} 35v4c0 2 2 2 2 4`} stroke="#E5E7EB" strokeWidth={0.9} fill="none" />
          </G>
        ))}
      </Counter>
    </G>
  ),
  glam: (v) => (
    <G>
      {/* Vanity mirror with bulbs */}
      <Rect x={12} y={0} width={40} height={30} rx={5} fill="#FFE8F1" stroke={INK} strokeWidth={1} />
      <Rect x={17} y={4} width={30} height={22} rx={3} fill="#C9E7F5" />
      <Path d="M20 22l8-14M26 24l9-15" stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />
      {[
        [14, 4],
        [14, 15],
        [14, 26],
        [50, 4],
        [50, 15],
        [50, 26],
        [24, 1.4],
        [32, 1.4],
        [40, 1.4],
      ].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill="#FFF7C2" stroke="#FFD166" strokeWidth={0.6} />
      ))}
      <Counter v={v}>
        <Rect x={8} y={26} width={5} height={9} rx={1} fill="#E03174" />
        <Rect x={8} y={24} width={5} height={3} fill="#FFD166" />
        <Ellipse cx={24} cy={33} rx={6} ry={2.4} fill="#F7C6D9" stroke={INK} strokeWidth={0.5} />
        <Path d="M34 33l10-9" stroke="#C08552" strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M44 24l3-3" stroke="#FFB3D1" strokeWidth={3} strokeLinecap="round" />
        <Rect x={50} y={27} width={6} height={8} rx={1.4} fill="#B983FF" />
      </Counter>
    </G>
  ),
  light: (v) => (
    <G>
      {[16, 32, 48].map((x, i) => (
        <G key={x}>
          <Line x1={x} y1={18 + i} x2={x} y2={40} stroke="#3A3A44" strokeWidth={1.4} />
          <Circle cx={x} cy={11 + i} r={8} fill="none" stroke="#FFF7D6" strokeWidth={3} />
          <Circle cx={x} cy={11 + i} r={8} fill="none" stroke="#FFFFFF" strokeWidth={0.6} opacity={0.8} />
        </G>
      ))}
      <Counter v={v}>
        <Rect x={6} y={44} width={52} height={3} rx={1.4} fill="#FFF7D6" opacity={0.5} />
      </Counter>
    </G>
  ),
  pr: (v) => (
    <G>
      {/* Laptop and contract stacks */}
      <Rect x={18} y={12} width={28} height={18} rx={2} fill="#E5E7EB" stroke={INK} strokeWidth={0.8} />
      <Rect x={20.5} y={14.5} width={23} height={13} rx={1} fill="#3A86FF" />
      <Path d="M24 24l4-4 3 3 5-6" stroke="#FFFFFF" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d="M14 30h36l3 4H11z" fill="#CBD5E1" stroke={INK} strokeWidth={0.6} />
      <Counter v={v}>
        {[0, 1, 2].map((i) => (
          <Rect key={i} x={4 + i * 1.2} y={28 - i * 2.2} width={11} height={6} rx={0.6} fill="#FFFFFF" stroke={INK} strokeWidth={0.5} />
        ))}
        <Circle cx={55} cy={29} r={4} fill="#FFD166" stroke={INK} strokeWidth={0.6} />
        <Path d="M53.6 29h2.8M55 27.6v2.8" stroke={INK} strokeWidth={0.8} />
      </Counter>
    </G>
  ),
};

/** A counter on the back wall, 64 × 70. */
export const StationSprite = memo(function StationSprite({ kind, venue }: { kind: StationKind; venue: VenuePalette }) {
  return (
    <Svg width={64} height={70} viewBox="-2 -4 68 74">
      {STATION_ART[kind](venue)}
    </Svg>
  );
});

// ─── Tables ───────────────────────────────────────────────────────────────

/** A banquet table, 168 × 52, seen from the front. */
export const TableSprite = memo(function TableSprite({ venue, id }: { venue: VenuePalette; id: number }) {
  const g = `cloth-${id}`;
  return (
    <Svg width={168} height={52} viewBox="0 0 168 52">
      <Defs>
        <LinearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={venue.cloth} />
          <Stop offset="1" stopColor={venue.clothShade} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={84} cy={48} rx={80} ry={4} fill="#000000" opacity={0.25} />
      {/* Table top */}
      <Rect x={4} y={2} width={160} height={16} rx={6} fill={venue.cloth} stroke={INK} strokeWidth={1} />
      {/* Skirt with folds */}
      <Path d="M5 12h158l-3 34H8z" fill={`url(#${g})`} stroke={INK} strokeWidth={1} />
      {[24, 44, 64, 84, 104, 124, 144].map((x) => (
        <Path key={x} d={`M${x} 18 l-1 27`} stroke={venue.clothShade} strokeWidth={1.6} opacity={0.9} />
      ))}
      {/* Runner */}
      <Path d="M70 2h28v44H70z" fill={venue.clothAccent} opacity={0.85} />
      <Path d="M70 46l14 4 14-4" fill={venue.clothAccent} opacity={0.85} />
      {/* Centerpiece: candles and a little phone tripod */}
      <Rect x={78} y={-2} width={3} height={8} rx={1} fill="#FFF4D6" />
      <Rect x={87} y={-4} width={3} height={10} rx={1} fill="#FFF4D6" />
      <Circle cx={79.5} cy={-3} r={1.5} fill="#FFD166" />
      <Circle cx={88.5} cy={-5} r={1.5} fill="#FFD166" />
    </Svg>
  );
});

/** A place setting under each seat: plate, glass, and food while they eat. */
export const PlaceSetting = memo(function PlaceSetting({ dish, eating }: { dish?: Dish; eating: boolean }) {
  return (
    <Svg width={30} height={14} viewBox="0 0 30 14">
      <Ellipse cx={13} cy={8} rx={10} ry={4.4} fill="#FFFFFF" stroke={INK} strokeWidth={0.6} />
      <Ellipse cx={13} cy={8} rx={6.4} ry={2.6} fill="#EEF2F7" />
      {eating && dish ? (
        <G transform="translate(5 -1.5) scale(0.66)">{ICON_ART[dish]}</G>
      ) : null}
      <Path d="M25 2.5h3.5l-.6 8h-2.3z" fill="#FFFFFF" opacity={0.75} stroke={INK} strokeWidth={0.4} />
    </Svg>
  );
});

// ─── Trouble ──────────────────────────────────────────────────────────────

export const TroubleSprite = memo(function TroubleSprite({ kind, frame }: { kind: TroubleKind; frame: number }) {
  switch (kind) {
    case 'paparazzi':
      return (
        <Svg width={44} height={70} viewBox="0 0 44 70">
          <Ellipse cx={22} cy={67} rx={12} ry={3} fill="#000" opacity={0.3} />
          {/* Trench coat */}
          <Path d="M10 66l2-26c0-6 4-9 10-9s10 3 10 9l2 26z" fill="#8D6E63" stroke={INK} strokeWidth={0.8} />
          <Path d="M22 31v35" stroke="#5D4037" strokeWidth={1} />
          <Path d="M16 34l6 8 6-8" fill="#D7CCC8" />
          {/* Head with fedora */}
          <Circle cx={22} cy={22} r={8} fill="#E0AC69" />
          <Path d="M11 17h22l-2-2h-3c0-4-2-6-6-6s-6 2-6 6h-3z" fill="#3E2723" />
          <Rect x={16} y={21} width={12} height={3} rx={1.4} fill="#111" />
          {/* Camera raised */}
          <G transform={frame ? 'translate(0 -1)' : undefined}>
            <Rect x={24} y={26} width={16} height={11} rx={2} fill="#2D3142" stroke={INK} strokeWidth={0.6} />
            <Circle cx={32} cy={31.5} r={3.6} fill="#4F5D75" stroke="#BFC0C0" strokeWidth={0.8} />
            <Rect x={35} y={23} width={5} height={3} rx={0.8} fill={frame ? '#FFFFFF' : '#9CA3AF'} />
          </G>
          <Path d="M14 40c4 0 8-4 10-8" stroke="#8D6E63" strokeWidth={4} strokeLinecap="round" />
        </Svg>
      );
    case 'troll':
      return (
        <Svg width={44} height={50} viewBox="0 0 44 50">
          <Ellipse cx={22} cy={47} rx={13} ry={3} fill="#000" opacity={0.3} />
          <Path d="M8 46c0-9 6-13 14-13s14 4 14 13z" fill="#4B5563" stroke={INK} strokeWidth={0.8} />
          <G transform={`translate(0 ${frame ? -1.5 : 0})`}>
            <Path d="M9 20C9 11 14.5 6 22 6s13 5 13 14v6c0 5-4.5 8.5-9.5 8.5h-7C13.5 34.5 9 31 9 26z" fill="#7BC950" stroke={INK} strokeWidth={1} />
            <Path d="M9.2 16 4 12h5.5M34.8 16 40 12h-5.5" fill="#7BC950" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
            <Circle cx={17} cy={19} r={3} fill="#FFFFFF" />
            <Circle cx={27} cy={19} r={3} fill="#FFFFFF" />
            <Circle cx={17.5} cy={19.5} r={1.5} fill="#E63946" />
            <Circle cx={26.5} cy={19.5} r={1.5} fill="#E63946" />
            <Path d="M13 14.5l6 2M31 14.5l-6 2" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
            <Path d="M15 27c4.5 3 9.5 3 14 0" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
            <Path d="M17.5 28l.8 2 1-1.7M25 28l.9 2 .9-1.7" fill="#FFFFFF" />
          </G>
          {/* Laptop */}
          <Path d="M10 40h24l3 6H7z" fill="#9CA3AF" stroke={INK} strokeWidth={0.6} />
          <Rect x={12} y={33} width={20} height={8} rx={1} fill="#111827" />
          <Path d="M14 36h8M14 38.5h12" stroke="#7CF29C" strokeWidth={0.9} />
        </Svg>
      );
    case 'drama':
      return (
        <Svg width={56} height={30} viewBox="0 0 56 30">
          <Path d={frame ? 'M2 16 10 6l6 12 8-14 6 14 8-12 6 12 8-10' : 'M2 12 10 20l6-12 8 14 6-14 8 12 6-12 8 10'} stroke="#FFD166" strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Path d={frame ? 'M2 16 10 6l6 12 8-14 6 14 8-12 6 12 8-10' : 'M2 12 10 20l6-12 8 14 6-14 8 12 6-12 8 10'} stroke="#FF4D6D" strokeWidth={1.2} fill="none" strokeLinejoin="round" />
        </Svg>
      );
    case 'spill':
      return (
        <Svg width={56} height={26} viewBox="0 0 56 26">
          <Path d="M4 14c0-5 7-7 11-5 3-5 12-6 16-2 5-3 15-1 15 5 4 1 4 7-2 8-3 4-12 4-17 2-6 3-15 2-18-2-4-1-5-4-5-6z" fill="#FF8FB1" stroke="#D6336C" strokeWidth={1} opacity={0.92} />
          <Ellipse cx={20} cy={12} rx={6} ry={2} fill="#FFFFFF" opacity={0.55} />
          <Ellipse cx={38} cy={16} rx={3} ry={1.2} fill="#FFFFFF" opacity={0.4} />
          <Path d="M44 4h6l-1 7h-4z" fill="#FFFFFF" stroke={INK} strokeWidth={0.6} transform="rotate(60 47 7)" />
        </Svg>
      );
    case 'wifi':
    case 'blackout':
      return (
        <Svg width={40} height={40} viewBox="0 0 24 24">
          {ICON_ART[kind]}
        </Svg>
      );
  }
});
