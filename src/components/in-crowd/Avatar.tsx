import { memo, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Gear, Look } from '@/features/in-crowd/engine/types';

/**
 * The In Crowd's creators, drawn in a glossy avatar style: soft-shaded
 * skin, almond eyes with real irises and catchlights, a nose, glossy lips,
 * hair with a shine, proper necklines and jewelry. Everything comes from a
 * creator's `Look`, and the face changes with how the night is going.
 *
 * Drawn on a 48 × 56 grid: head centered around (24, 21), shoulders at the
 * bottom. Gradient ids are prefixed with the instance id so two avatars on
 * one screen never share them.
 */
export type Expression = 'love' | 'happy' | 'ok' | 'meh' | 'mad' | 'shock';

export function expressionFor(mood: number, opts: { love?: boolean; drama?: boolean; shake?: boolean } = {}): Expression {
  if (opts.drama) return 'mad';
  if (opts.shake) return 'shock';
  if (opts.love) return 'love';
  if (mood >= 4) return 'happy';
  if (mood >= 2.6) return 'ok';
  if (mood >= 1.5) return 'meh';
  return 'mad';
}

// ─── Color helpers ────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend `a` toward `b` by `t` (0–1). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((c(r1, r2) << 16) | (c(g1, g2) << 8) | c(b1, b2)).toString(16).padStart(6, '0')}`;
}

/** Slightly darker version of a hex color, for shading. */
export function shade(hex: string, amount = 0.18): string {
  return amount >= 0 ? mix(hex, '#000000', amount) : mix(hex, '#FFFFFF', -amount);
}

function lightness(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const INK = '#1B1426';
const GOLD = ['#FFF1B8', '#F5C542', '#B7791F'] as const;

const EYES_DARK = ['#3B2414', '#5B3A1E', '#4A2A17', '#6B4423'];
const EYES_ANY = ['#5B3A1E', '#7A5226', '#3E7F4E', '#3E6FA8', '#6E7F8F', '#8A5A2B', '#2F6F73'];

/** Fills in the optional parts of a look from the rest of it. */
function resolve(look: Look) {
  const h = hash(`${look.skin}${look.hair}${look.hairColor}${look.top}`);
  const light = lightness(look.skin);
  const eyes = look.eyes ?? (light < 0.55 ? EYES_DARK[h % EYES_DARK.length] : EYES_ANY[h % EYES_ANY.length]) ?? '#5B3A1E';
  const short = look.hair === 'buzz' || look.hair === 'fade' || look.hair === 'bald' || look.hair === 'spiky';
  const lashes = look.lashes ?? (!look.beard && !short);
  const naturalLip = light > 0.75 ? '#D98B85' : light > 0.55 ? '#C06D62' : light > 0.4 ? '#9C5248' : '#7A3B35';
  const lips = look.lips ?? naturalLip;
  const neck: NonNullable<Look['neck']> =
    look.neck ?? ({ solid: 'v', stripes: 'crew', dots: 'scoop', sequins: 'scoop', check: 'collar', zip: 'hood' } as const)[look.pattern];
  const pale = lightness(look.hairColor) > 0.72;
  const brow = pale ? mix(look.hairColor, '#6B5643', 0.55) : mix(look.hairColor, '#000000', 0.15);
  // Faces vary a little in width so the crowd doesn't look cloned.
  const faceWidth = 0.95 + ((h >> 5) % 5) * 0.025;
  const makeup: 'natural' | 'lite' | 'glam' | 'bold' = look.makeup && look.makeup !== 'natural' ? look.makeup : look.lips ? 'lite' : 'natural';
  const earrings = look.earrings ?? (look.acc === 'hoops' ? 'hoops' : undefined);
  const necklace = look.necklace ?? (look.lips && (neck === 'v' || neck === 'scoop') ? 'chain' : undefined);
  return { eyes, lashes, lips, makeup, neck, brow, faceWidth, earrings, necklace };
}

// ─── Hair ─────────────────────────────────────────────────────────────────

function hairBack(look: Look, fill: string): ReactNode {
  const dark = mix(look.hairColor, '#000000', 0.4);
  switch (look.hair) {
    case 'long':
      return (
        <Path
          d="M10.8 19C10.4 9.6 16.4 5.4 24 5.4S37.6 9.6 37.2 19L38.4 40.6C38.6 44.4 36.2 46.4 33 45.8L30 45C30.6 41 30.2 36.6 29 33H19C17.8 36.6 17.4 41 18 45L15 45.8C11.8 46.4 9.4 44.4 9.6 40.6Z"
          fill={fill}
        />
      );
    case 'bob':
      return <Path d="M10.6 20C10.2 9.8 16.2 5.8 24 5.8S37.8 9.8 37.4 20L37.8 31.6C37.8 33.6 36.2 34.6 34.2 34.2L31 33.6V27H17V33.6L13.8 34.2C11.8 34.6 10.2 33.6 10.2 31.6Z" fill={fill} />;
    case 'afro':
      return (
        <G fill={fill}>
          <Circle cx={24} cy={15.6} r={14.4} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 12;
            return <Circle key={i} cx={24 + Math.cos(a) * 13.6} cy={15.6 + Math.sin(a) * 12.6} r={4.6} />;
          })}
          <G fill="none" stroke={dark} strokeWidth={0.5} opacity={0.45}>
            {[
              [14, 8],
              [20, 4.6],
              [28, 4.4],
              [34, 8.4],
              [37.6, 15],
              [10.4, 15.4],
            ].map(([x, y]) => (
              <Path key={`${x}-${y}`} d={`M${x} ${y}c1-1.2 2.6-.8 2.6.6s-1.8 1.6-2.2.4`} />
            ))}
          </G>
        </G>
      );
    case 'ponytail':
      return (
        <G>
          <Path d="M31.4 9.4C39.4 9.2 42.6 15.4 41.8 23.8 41.2 30.4 39.2 37.2 35.6 41.4 34.4 38.2 35.4 33.4 35.8 28.6 36.2 22.4 34.6 16.4 30.8 13.2Z" fill={fill} />
          <Path d="M38.6 16C39.6 21 39 27 37.4 33" stroke={dark} strokeWidth={0.5} opacity={0.5} fill="none" />
        </G>
      );
    case 'braids':
      return (
        <G>
          <Path d="M11 19C10.6 9 16.4 5.6 24 5.6S37.4 9 37 19L37.6 30H10.4Z" fill={fill} />
          {[10.6, 13.8, 34.2, 37.4].map((x) => (
            <G key={x}>
              <Rect x={x - 1.5} y={17} width={3} height={29} rx={1.5} fill={fill} />
              {Array.from({ length: 12 }, (_, i) => (
                <Path key={i} d={`M${x - 1.4} ${19 + i * 2.3}l2.8 1.4`} stroke={dark} strokeWidth={0.45} opacity={0.6} />
              ))}
              <Circle cx={x} cy={46.6} r={1.3} fill={GOLD[1]} stroke={GOLD[2]} strokeWidth={0.3} />
            </G>
          ))}
        </G>
      );
    case 'waves':
      return (
        <Path
          d="M10.8 19.4C10.2 9.4 16.2 5.6 24 5.6S37.8 9.4 37.2 19.4C38.6 23 38 26.4 38.8 30 39.6 33.6 38.4 37 36 38 34.6 36.4 33.6 34 32 33H16C14.4 34 13.4 36.4 12 38 9.6 37 8.4 33.6 9.2 30 10 26.4 9.4 23 10.8 19.4Z"
          fill={fill}
        />
      );
    case 'bun':
      return (
        <G>
          <Circle cx={24} cy={5.4} r={5.4} fill={fill} />
          <Path d="M21.4 4.4C23 2.6 26.6 3.4 26.6 5.6S24 7.8 23.2 6.4" stroke={dark} strokeWidth={0.6} fill="none" opacity={0.5} />
        </G>
      );
    case 'curtain':
      return <Path d="M11.2 20C10.8 10 16.6 6 24 6S37.2 10 36.8 20V26H11.2Z" fill={fill} />;
    default:
      return null;
  }
}

function hairFront(look: Look, fill: string): ReactNode {
  const dark = mix(look.hairColor, '#000000', 0.32);
  const strand = (d: string, key: string) => <Path key={key} d={d} stroke={dark} strokeWidth={0.45} fill="none" opacity={0.55} strokeLinecap="round" />;
  const slick = 'M11.8 21.2C11.2 12 16.6 7.4 24 7.4S36.8 12 36.2 21.2C34.8 16.6 31.4 14.2 24 14.2S13.2 16.6 11.8 21.2Z';
  switch (look.hair) {
    case 'bun':
      return (
        <G>
          <Path d={slick} fill={fill} />
          {strand('M15.4 15.6C17.6 11.6 20.6 9.4 24 9', 'a')}
          {strand('M32.6 15.6C30.4 11.6 27.4 9.4 24 9', 'b')}
          {strand('M19.6 14.6C20.8 11.6 22.2 10 24 9.4', 'c')}
          <Path d="M19.4 9.6C22.4 10.8 25.6 10.8 28.6 9.6" stroke={mix(look.hairColor, '#000000', 0.45)} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'ponytail':
      return (
        <G>
          <Path d="M11.8 21.2C11.2 12 16.6 7.4 24 7.4S36.8 12 36.2 21.2C35 17.2 32.4 14.6 27.6 13.8 23 14.2 16 15.2 11.8 21.2Z" fill={fill} />
          {strand('M15 16.4C18 12.6 22 11 26.4 11.2', 'a')}
          {strand('M20 13.8C23 12 27 11.6 31 12.6', 'b')}
          <Rect x={31.6} y={9.6} width={3.6} height={2.4} rx={1.1} fill={mix(look.hairColor, '#000000', 0.5)} transform="rotate(28 33.4 10.8)" />
        </G>
      );
    case 'long':
      return (
        <G>
          <Path d="M11.6 23.4C10.6 12.6 16.2 6.6 24.4 6.6 31.8 6.6 37 11.4 36.6 20.6 35.6 16.6 33.4 13.6 30 12.4 27 14.6 21.6 15.6 16.6 15.4 14.2 17.4 12.6 20 11.6 23.4Z" fill={fill} />
          {strand('M18 12.8C21 11 25 10.6 29 11.6', 'a')}
          {strand('M14.8 18C16 15.6 18 14 21 13.2', 'b')}
        </G>
      );
    case 'bob':
      return (
        <G>
          <Path d="M11.8 21.6C11.2 11.6 16.6 6.6 24 6.6S36.8 11.6 36.2 21.6C35.6 19.6 35 18.2 34.4 17.4 27.8 18.4 20.2 18.4 13.6 17.4 13 18.2 12.4 19.6 11.8 21.6Z" fill={fill} />
          {strand('M18 17.9L18.6 13.6', 'a')}
          {strand('M23 18.2L23.2 13.8', 'b')}
          {strand('M28.4 18L28 13.8', 'c')}
        </G>
      );
    case 'afro':
      return <Path d="M13.2 19.8C14.2 13.8 18.6 11.4 24 11.4S33.8 13.8 34.8 19.8C32.8 16.8 28.8 15.4 24 15.4S15.2 16.8 13.2 19.8Z" fill={mix(look.hairColor, '#000000', 0.18)} />;
    case 'buzz':
      return (
        <G>
          <Path d="M12.6 19.4C12.6 11.2 17.4 7.8 24 7.8S35.4 11.2 35.4 19.4C33.8 15.6 29.6 14.2 24 14.2S14.2 15.6 12.6 19.4Z" fill={fill} opacity={0.88} />
          {Array.from({ length: 18 }, (_, i) => (
            <Circle key={i} cx={15 + ((i * 7.1) % 18)} cy={10 + ((i * 3.3) % 5)} r={0.22} fill={dark} opacity={0.6} />
          ))}
        </G>
      );
    case 'fade':
      return (
        <G>
          <Path d="M12.4 16.4C12.2 18.6 12.4 20.6 12.8 22.4H14C13.6 20.4 13.6 18.4 14 16.6ZM35.6 16.4C35.8 18.6 35.6 20.6 35.2 22.4H34C34.4 20.4 34.4 18.4 34 16.6Z" fill={look.hairColor} opacity={0.4} />
          <Path d="M13.2 17.2C12.8 9.8 17.6 5.4 24.4 5.6S35.6 10.2 35 17C33 14.2 29.6 12.8 24 13S15.2 14.2 13.2 17.2Z" fill={fill} />
          {[16, 19.4, 22.8, 26.2, 29.6].map((x) => strand(`M${x} ${11.4 - Math.abs(x - 23) * 0.15}c.8-1 2-1 2.6 0`, `c${x}`))}
        </G>
      );
    case 'braids':
      return (
        <G>
          <Path d="M11.8 21.4C11.2 12 16.6 7 24 7S36.8 12 36.2 21.4C35 17 32.4 14.6 28.4 14 26.4 13.8 25 12.8 24 11 23 12.8 21.6 13.8 19.6 14 15.6 14.6 13 17 11.8 21.4Z" fill={fill} />
          {strand('M17 14.4L16 10.6', 'a')}
          {strand('M20.6 13.6L20.2 9.2', 'b')}
          {strand('M27.4 13.6L27.8 9.2', 'c')}
          {strand('M31 14.4L32 10.6', 'd')}
        </G>
      );
    case 'waves':
      return (
        <G>
          <Path d="M11.8 22.6C11.2 12 16.8 7 24 7S36.8 12 36.2 22.6C35.4 19 34.2 16.6 32 15.2 30 14.4 27.6 13 25.8 10.6 25.2 10 24.6 9.8 24 10 23.4 9.8 22.8 10 22.2 10.6 20.4 13 18 14.4 16 15.2 13.8 16.6 12.6 19 11.8 22.6Z" fill={fill} />
          {strand('M14 18.6C15.6 16.6 17 16.4 18.4 14.6', 'a')}
          {strand('M34 18.6C32.4 16.6 31 16.4 29.6 14.6', 'b')}
        </G>
      );
    case 'spiky':
      return (
        <G>
          <Path d="M12.6 20.4L11.4 13.2 15.2 14.6 14.6 7.4 19 11.4 20.6 3.8 24.2 10 27.6 4.2 29 11 33.4 7.6 33 14.4 36.6 13 35.4 20.4C33.4 16 29.6 14.4 24 14.4S14.6 16 12.6 20.4Z" fill={fill} />
          {strand('M17.4 13.6L16.2 9.6', 'a')}
          {strand('M22 12.6L21.4 7', 'b')}
          {strand('M26.4 12.6L27.4 7.4', 'c')}
          {strand('M30.6 13.6L32 10', 'd')}
        </G>
      );
    case 'curtain':
      return (
        <G>
          <Path d="M11.8 23.6C11.2 12.4 16.8 7 24 7S36.8 12.4 36.2 23.6C35.2 19.6 33.2 16.2 29.8 14.8 27.6 13.8 25.4 12.6 24.4 10.8L24 15.2 23.6 10.8C22.6 12.6 20.4 13.8 18.2 14.8 14.8 16.2 12.8 19.6 11.8 23.6Z" fill={fill} />
          {strand('M14.4 19C15.6 16.4 17.6 15 20.4 13.8', 'a')}
          {strand('M33.6 19C32.4 16.4 30.4 15 27.6 13.8', 'b')}
        </G>
      );
    case 'bald':
      return null;
  }
}

/** The glossy highlight that makes hair read as shiny. */
function hairShine(look: Look): ReactNode {
  if (look.hair === 'bald') return <Ellipse cx={20.4} cy={12.4} rx={4.4} ry={2.2} fill="#FFFFFF" opacity={0.32} transform="rotate(-18 20.4 12.4)" />;
  if (look.hair === 'buzz' || look.acc === 'cap' || look.acc === 'beanie') return null;
  const top = look.hair === 'afro' ? 4.6 : look.hair === 'fade' ? 7.6 : look.hair === 'spiky' ? 9.6 : 9.2;
  return (
    <G opacity={0.5}>
      <Path d={`M16.4 ${top + 4}C18.6 ${top + 1} 22 ${top - 0.4} 26 ${top}`} stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
      <Path d={`M28.6 ${top + 0.6}C30 ${top + 1.2} 31 ${top + 2} 31.6 ${top + 2.8}`} stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.5} />
    </G>
  );
}

// ─── Face ─────────────────────────────────────────────────────────────────

/** Mirrors x for the right-hand side of the face. */
const mx = (x: number, side: 1 | -1) => (side === 1 ? x : 48 - x);

function almond(side: 1 | -1, grow = 1) {
  const cx = mx(19.3, side);
  const X = (x: number) => cx + (mx(x, side) - cx) * grow;
  const Y = (y: number) => 22.25 + (y - 22.25) * grow;
  return `M${X(15.9)} ${Y(22.5)}C${X(16.9)} ${Y(20.6)} ${X(18.1)} ${Y(19.9)} ${X(19.3)} ${Y(19.9)}C${X(20.6)} ${Y(19.9)} ${X(21.8)} ${Y(20.7)} ${X(22.6)} ${Y(22.3)}C${X(21.8)} ${Y(23.9)} ${X(20.6)} ${Y(24.6)} ${X(19.3)} ${Y(24.6)}C${X(18)} ${Y(24.6)} ${X(16.8)} ${Y(23.9)} ${X(15.9)} ${Y(22.5)}Z`;
}

function eye(side: 1 | -1, expr: Expression, id: string, skin: string, lashes: boolean, makeup: 'natural' | 'lite' | 'glam' | 'bold'): ReactNode {
  const cx = mx(19.3, side);
  const mascara = makeup === 'glam' || makeup === 'bold';
  const lashPath = mascara
    ? `M${mx(16, side)} 22.1L${mx(14.3, side)} 21.3M${mx(16.5, side)} 21.3L${mx(15.1, side)} 20.1M${mx(17.2, side)} 20.6L${mx(16.4, side)} 19.2M${mx(18.1, side)} 20.1L${mx(17.8, side)} 18.7M${mx(19.1, side)} 19.9L${mx(19.1, side)} 18.6`
    : `M${mx(16.2, side)} 21.8L${mx(15, side)} 21.1M${mx(16.8, side)} 21L${mx(15.9, side)} 20.1M${mx(17.6, side)} 20.4L${mx(17.1, side)} 19.4`;
  const wingTip: [number, number] = makeup === 'bold' ? [13.2, 20.4] : [13.9, 21];
  const wing = mascara ? <Path d={`M${mx(15.9, side)} 22.4L${mx(wingTip[0], side)} ${wingTip[1]}L${mx(16.4, side)} 21.6Z`} fill={INK} /> : null;
  const lower = mascara ? (
    <Path d={`M${mx(16.6, side)} 23.4L${mx(15.8, side)} 24.1M${mx(17.4, side)} 24L${mx(16.9, side)} 24.8`} stroke={INK} strokeWidth={0.4} strokeLinecap="round" />
  ) : null;
  const lashLine = lashes ? (
    <G>
      <Path d={lashPath} stroke={INK} strokeWidth={mascara ? 0.72 : 0.55} strokeLinecap="round" />
      {wing}
      {lower}
    </G>
  ) : null;

  if (expr === 'happy') {
    return (
      <G>
        <Path d={`M${mx(16.2, side)} 23C${mx(17.4, side)} 20.9 ${mx(21.2, side)} 20.9 ${mx(22.4, side)} 23`} stroke={INK} strokeWidth={1.15} strokeLinecap="round" fill="none" />
        {lashes ? <Path d={`M${mx(16.4, side)} 22.4L${mx(15.2, side)} 21.9M${mx(17, side)} 21.7L${mx(16.2, side)} 20.9`} stroke={INK} strokeWidth={mascara ? 0.75 : 0.5} strokeLinecap="round" /> : null}
        {mascara ? <Path d={`M${mx(16.2, side)} 23L${mx(wingTip[0], side)} ${wingTip[1] + 0.6}L${mx(16.6, side)} 22.4Z`} fill={INK} /> : null}
      </G>
    );
  }
  if (expr === 'love') {
    return (
      <G>
        <Path
          d={`M${cx} 25.2C${mx(16.2, side)} 23.4 ${mx(15.4, side)} 21.6 ${mx(16.2, side)} 20.4C${mx(17, side)} 19.2 ${mx(18.6, side)} 19.4 ${cx} 20.6C${mx(20, side)} 19.4 ${mx(21.6, side)} 19.2 ${mx(22.4, side)} 20.4C${mx(23.2, side)} 21.6 ${mx(22.4, side)} 23.4 ${cx} 25.2Z`}
          fill={`url(#${id}-heart)`}
          stroke="#A3122F"
          strokeWidth={0.4}
        />
        <Ellipse cx={mx(17.6, side)} cy={21.2} rx={0.8} ry={0.5} fill="#FFFFFF" opacity={0.8} />
      </G>
    );
  }
  const grow = expr === 'shock' ? 1.18 : 1;
  const r = expr === 'shock' ? 1.55 : 1.95;
  // Upper lid lowered when bored or annoyed (angled down toward the nose when mad).
  const lid =
    expr === 'meh'
      ? `M${mx(15.7, side)} 22.6C${mx(16.8, side)} 20.2 ${mx(18.2, side)} 19.5 ${cx} 19.5C${mx(20.7, side)} 19.5 ${mx(22, side)} 20.4 ${mx(22.8, side)} 22.3C${mx(21.4, side)} 21.8 ${mx(17.2, side)} 21.8 ${mx(15.7, side)} 22.6Z`
      : expr === 'mad'
        ? `M${mx(15.7, side)} 22C${mx(16.8, side)} 20 ${mx(18.2, side)} 19.5 ${cx} 19.5C${mx(20.7, side)} 19.5 ${mx(22, side)} 20.4 ${mx(22.8, side)} 22.6C${mx(21, side)} 22.4 ${mx(17.6, side)} 21.2 ${mx(15.7, side)} 22Z`
        : null;
  return (
    <G>
      <Path d={almond(side, grow)} fill={`url(#${id}-sclera)`} />
      <Circle cx={cx} cy={22.3} r={r} fill={`url(#${id}-iris)`} stroke={INK} strokeWidth={0.3} strokeOpacity={0.6} />
      <Circle cx={cx} cy={22.3} r={r * 0.45} fill="#0E0B10" />
      <Circle cx={cx + 0.65} cy={21.6} r={0.62} fill="#FFFFFF" />
      <Circle cx={cx - 0.6} cy={23} r={0.28} fill="#FFFFFF" opacity={0.85} />
      {lid ? <Path d={lid} fill={mix(skin, '#000000', 0.06)} /> : null}
      <Path
        d={
          lid
            ? expr === 'meh'
              ? `M${mx(15.7, side)} 22.6C${mx(17.2, side)} 21.8 ${mx(21.4, side)} 21.8 ${mx(22.8, side)} 22.3`
              : `M${mx(15.7, side)} 22C${mx(17.6, side)} 21.2 ${mx(21, side)} 22.4 ${mx(22.8, side)} 22.6`
            : `M${mx(15.8, side)} 22.5C${mx(16.9, side)} 20.4 ${mx(18.2, side)} ${grow > 1 ? 19.3 : 19.7} ${cx} ${grow > 1 ? 19.3 : 19.7}C${mx(20.7, side)} ${grow > 1 ? 19.3 : 19.7} ${mx(21.9, side)} 20.5 ${mx(22.7, side)} 22.2`
        }
        stroke={INK}
        strokeWidth={0.95}
        strokeLinecap="round"
        fill="none"
      />
      {lashLine}
      <Path d={`M${mx(16.3, side)} 22.9C${mx(17.4, side)} 24.2 ${mx(18.4, side)} 24.7 ${cx} 24.7C${mx(20.4, side)} 24.7 ${mx(21.4, side)} 24.1 ${mx(22.2, side)} 22.9`} stroke={mix(skin, '#000000', 0.35)} strokeWidth={0.35} fill="none" opacity={0.6} />
    </G>
  );
}

function brows(expr: Expression, color: string): ReactNode {
  const tf: Record<Expression, string | undefined> = {
    ok: undefined,
    happy: 'translate(0 -0.5)',
    love: 'translate(0 -0.6)',
    meh: 'rotate(-7 19 18)',
    mad: 'rotate(13 19 18) translate(0 0.4)',
    shock: 'translate(0 -1.4)',
  };
  const left = (
    <Path
      d="M15.8 18.6C17.2 17.2 19.8 16.8 22.4 17.6 22.6 17.9 22.5 18.4 22.2 18.5 20 18 17.8 18.2 16.3 19.2 15.9 19.4 15.6 19 15.8 18.6Z"
      fill={color}
      transform={tf[expr]}
    />
  );
  return (
    <G>
      {left}
      <G transform="translate(48 0) scale(-1 1)">{left}</G>
    </G>
  );
}

function mouth(expr: Expression, lip: string, liner = false): ReactNode {
  const upper = mix(lip, '#000000', 0.12);
  const line = mix(lip, '#000000', 0.35);
  switch (expr) {
    case 'happy':
    case 'love':
      return (
        <G>
          <Path d="M20.2 29.2C22.4 30.2 25.6 30.2 27.8 29.2 27.4 32.8 25.8 34.4 24 34.4S20.6 32.8 20.2 29.2Z" fill="#4A0F1C" />
          <Path d="M20.8 29.6C22.6 30.4 25.4 30.4 27.2 29.6L27 30.9C25.2 31.4 22.8 31.4 21 30.9Z" fill="#FFFFFF" />
          <Path d="M21.8 33C23 32 25 32 26.2 33 25.4 34 22.6 34 21.8 33Z" fill="#E2586E" />
          <Path d="M20.2 29.2C22.4 30.2 25.6 30.2 27.8 29.2" stroke={upper} strokeWidth={0.9} fill="none" strokeLinecap="round" />
          <Path d="M20.6 30.4C21.4 33.4 22.6 34.4 24 34.4S26.6 33.4 27.4 30.4" stroke={lip} strokeWidth={1.1} fill="none" strokeLinecap="round" />
          <Ellipse cx={24.8} cy={34.1} rx={0.8} ry={0.25} fill="#FFFFFF" opacity={0.5} />
        </G>
      );
    case 'meh':
      return (
        <G>
          <Path d="M21.2 30.1C22.4 29.7 23.3 29.8 24 30 24.7 29.8 25.6 29.7 26.8 30.1 25.8 30.4 24.9 30.5 24 30.5S22.2 30.4 21.2 30.1Z" fill={upper} />
          <Path d="M21.5 30.3C22.5 31.4 25.5 31.4 26.5 30.3 25.4 30.7 22.6 30.7 21.5 30.3Z" fill={lip} />
          <Ellipse cx={24.6} cy={30.95} rx={0.8} ry={0.22} fill="#FFFFFF" opacity={0.45} />
        </G>
      );
    case 'mad':
      return (
        <G>
          <Path d="M21 30.8C22.2 29.9 23.2 29.9 24 30.2 24.8 29.9 25.8 29.9 27 30.8 25.9 30.7 24.9 30.7 24 30.8 23.1 30.7 22.1 30.7 21 30.8Z" fill={upper} />
          <Path d="M21.4 30.9C22.4 31.9 25.6 31.9 26.6 30.9 25.4 31 22.6 31 21.4 30.9Z" fill={lip} />
          <Path d="M21 30.8L20.3 31.6M27 30.8L27.7 31.6" stroke={line} strokeWidth={0.5} strokeLinecap="round" />
        </G>
      );
    case 'shock':
      return (
        <G>
          <Ellipse cx={24} cy={31.2} rx={1.9} ry={2.3} fill="#4A0F1C" stroke={lip} strokeWidth={1.1} />
          <Path d="M22.6 29.8C23.4 29.4 24.6 29.4 25.4 29.8" stroke="#FFFFFF" strokeWidth={0.6} strokeLinecap="round" />
        </G>
      );
    default:
      return (
        <G>
          <Path d="M20.9 29.8C22.1 29.1 23.2 29.3 24 29.7 24.8 29.3 25.9 29.1 27.1 29.8 26 30.3 25 30.5 24 30.5S22 30.3 20.9 29.8Z" fill={upper} />
          <Path d="M21.3 30.1C22.3 31.8 25.7 31.8 26.7 30.1 25.6 30.6 22.4 30.6 21.3 30.1Z" fill={lip} />
          <Path d="M20.9 29.8C20.5 29.5 20.3 29.3 20.2 29M27.1 29.8C27.5 29.5 27.7 29.3 27.8 29" stroke={line} strokeWidth={0.5} strokeLinecap="round" fill="none" />
          {liner ? (
            <Path d="M20.9 29.8C22.1 29.1 23.2 29.3 24 29.7 24.8 29.3 25.9 29.1 27.1 29.8 26.4 31.6 25.2 31.9 24 31.9S21.6 31.6 20.9 29.8Z" stroke={line} strokeWidth={0.35} fill="none" opacity={0.8} />
          ) : null}
          <Ellipse cx={24.6} cy={31} rx={liner ? 1.2 : 0.9} ry={liner ? 0.36 : 0.28} fill="#FFFFFF" opacity={liner ? 0.7 : 0.5} />
        </G>
      );
  }
}

// ─── Outfit ───────────────────────────────────────────────────────────────

const TORSO = 'M2.5 56C3 46.2 9.4 41.4 17.6 40.2 19.6 41.6 21.6 42.2 24 42.2S28.4 41.6 30.4 40.2C38.6 41.4 45 46.2 45.5 56Z';

function torsoPattern(look: Look): ReactNode {
  const a = look.topAccent;
  switch (look.pattern) {
    case 'stripes':
      return (
        <G stroke={a} strokeWidth={1.8} opacity={0.9}>
          {[45.5, 49.5, 53.5].map((y) => (
            <Line key={y} x1={0} y1={y} x2={48} y2={y} />
          ))}
        </G>
      );
    case 'dots':
      return (
        <G fill={a}>
          {[
            [9, 49],
            [15, 45.5],
            [20.5, 51],
            [27.5, 51],
            [33, 45.5],
            [39, 49],
            [12.5, 54],
            [36, 54],
            [24, 55],
          ].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} />
          ))}
        </G>
      );
    case 'sequins':
      return (
        <G>
          {Array.from({ length: 30 }, (_, i) => {
            const x = 5 + ((i * 7.3) % 38);
            const y = 43 + ((i * 3.7) % 13);
            return <Circle key={i} cx={x} cy={y} r={0.75} fill={i % 3 === 0 ? '#FFFFFF' : a} opacity={i % 2 ? 0.95 : 0.55} />;
          })}
        </G>
      );
    case 'check':
      return (
        <G stroke={a} strokeWidth={0.8} opacity={0.55}>
          {[8, 14, 20, 28, 34, 40].map((x) => (
            <Line key={`v${x}`} x1={x} y1={40} x2={x} y2={56} />
          ))}
          {[45, 50.5, 55].map((y) => (
            <Line key={`h${y}`} x1={0} y1={y} x2={48} y2={y} />
          ))}
        </G>
      );
    default:
      return null;
  }
}

function neckline(look: Look, neck: NonNullable<Look['neck']>, skinNeck: string): ReactNode {
  const edge = mix(look.top, '#000000', 0.3);
  switch (neck) {
    case 'crew':
      return (
        <G>
          <Path d="M17.8 40.4C19.8 43 28.2 43 30.2 40.4" stroke={edge} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <Path d="M18.4 41.6C20.4 43.4 27.6 43.4 29.6 41.6" stroke={look.topAccent} strokeWidth={0.5} fill="none" opacity={0.7} />
        </G>
      );
    case 'v':
      return (
        <G>
          <Path d="M18.6 40.3C20.4 41.4 21.6 42 24 47.5 26.4 42 27.6 41.4 29.4 40.3Z" fill={skinNeck} />
          <Path d="M18.4 40.2C20.6 41.6 22 43 24 47.8 26 43 27.4 41.6 29.6 40.2" stroke={look.topAccent} strokeWidth={1.1} fill="none" strokeLinejoin="round" />
        </G>
      );
    case 'collar':
      return (
        <G>
          <Path d="M24 44.6V56" stroke={edge} strokeWidth={0.5} opacity={0.6} />
          <Circle cx={24.9} cy={48.6} r={0.5} fill={look.topAccent} />
          <Circle cx={24.9} cy={52.6} r={0.5} fill={look.topAccent} />
          <Path d="M17.6 40L23.6 44.8 20.4 47.6 16.2 42.4Z" fill={look.topAccent} stroke={edge} strokeWidth={0.5} strokeLinejoin="round" />
          <Path d="M30.4 40L24.4 44.8 27.6 47.6 31.8 42.4Z" fill={look.topAccent} stroke={edge} strokeWidth={0.5} strokeLinejoin="round" />
        </G>
      );
    case 'hood':
      return (
        <G>
          <Path d="M14.6 41.2C17.4 46 30.6 46 33.4 41.2" stroke={mix(look.top, '#000000', 0.22)} strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <Path d="M24 45.4V56" stroke={look.topAccent} strokeWidth={1.1} />
          <Rect x={23.2} y={46.2} width={1.6} height={2.6} rx={0.6} fill={look.topAccent} />
          <Path d="M21.4 44.6L20.8 50.4M26.6 44.6L27.2 50.4" stroke={mix(look.topAccent, '#FFFFFF', 0.3)} strokeWidth={0.55} strokeLinecap="round" />
        </G>
      );
    case 'scoop':
      return (
        <G>
          <Path d="M16.8 40.4C18 46.6 30 46.6 31.2 40.4Z" fill={skinNeck} />
          <Path d="M16.6 40.4C17.8 47 30.2 47 31.4 40.4" stroke={look.topAccent} strokeWidth={0.9} fill="none" />
          <Path d="M19.6 43.6C21 44.2 22 44.2 23 43.8M25 43.8C26 44.2 27 44.2 28.4 43.6" stroke={mix(skinNeck, '#000000', 0.25)} strokeWidth={0.4} fill="none" opacity={0.6} />
        </G>
      );
  }
}

// ─── Accessories ──────────────────────────────────────────────────────────

function faceGear(look: Look, id: string): ReactNode {
  const c = look.accColor;
  switch (look.acc) {
    case 'shades': {
      const lens = 'M15.2 20.6C15.2 19.6 15.9 19.2 16.8 19.2H21.8C22.7 19.2 23.2 19.7 23.1 20.6L22.8 23.4C22.6 24.8 21.6 25.6 20.2 25.6H18.2C16.4 25.6 15.2 24.6 15.2 23Z';
      return (
        <G>
          <Path d="M15.3 20.4L12.4 20.9M32.7 20.4L35.6 20.9" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
          {[1, -1].map((s) => (
            <G key={s} transform={s === -1 ? 'translate(48 0) scale(-1 1)' : undefined}>
              <Path d={lens} fill={`url(#${id}-lens)`} stroke={INK} strokeWidth={0.7} />
              <Path d="M16.6 23.8L19.8 19.9M18.6 24.6L20.6 22.2" stroke="#FFFFFF" strokeWidth={0.7} opacity={0.45} strokeLinecap="round" />
            </G>
          ))}
          <Path d="M23.1 20.2C23.7 19.6 24.3 19.6 24.9 20.2" stroke={INK} strokeWidth={0.9} fill="none" />
        </G>
      );
    }
    case 'glasses':
      return (
        <G>
          {[19.3, 28.7].map((x) => (
            <G key={x}>
              <Circle cx={x} cy={22.3} r={3.5} fill="#FFFFFF" fillOpacity={0.08} stroke={c} strokeWidth={0.9} />
              <Path d={`M${x - 2} ${21}C${x - 1.4} ${20.1} ${x - 0.6} ${19.7} ${x + 0.4} ${19.6}`} stroke="#FFFFFF" strokeWidth={0.5} opacity={0.6} fill="none" strokeLinecap="round" />
            </G>
          ))}
          <Path d="M22.8 21.8C23.6 21.2 24.4 21.2 25.2 21.8M15.8 21.6L12.6 20.9M32.2 21.6L35.4 20.9" stroke={c} strokeWidth={0.8} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'visor':
      return (
        <G>
          <Path d="M13.4 19.6C17 18.6 31 18.6 34.6 19.6L34.2 24.6C30.4 25.6 17.6 25.6 13.8 24.6Z" fill={`url(#${id}-lens)`} opacity={0.88} stroke={INK} strokeWidth={0.5} />
          <Path d="M16 23.6C20 20.4 26 20 31 20.6" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.5} fill="none" strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

function headGear(look: Look, id: string): ReactNode {
  const c = look.accColor;
  const dark = mix(c, '#000000', 0.22);
  switch (look.acc) {
    case 'beanie':
      return (
        <G>
          <Path d="M11.4 17.6C11 8.6 16.6 4.4 24 4.4S37 8.6 36.6 17.6Z" fill={`url(#${id}-acc)`} />
          {[15, 18.5, 22, 25.5, 29, 32.5].map((x) => (
            <Path key={x} d={`M${x} ${9 - Math.abs(x - 24) * 0.12}V15`} stroke={dark} strokeWidth={0.4} opacity={0.5} />
          ))}
          <Rect x={11} y={14.6} width={26} height={4.6} rx={2.3} fill={dark} />
          {Array.from({ length: 12 }, (_, i) => (
            <Path key={i} d={`M${12.6 + i * 2} 15V18.8`} stroke={mix(c, '#000000', 0.38)} strokeWidth={0.45} />
          ))}
          <Circle cx={24} cy={4} r={2.9} fill={mix(c, '#FFFFFF', 0.35)} />
          <Circle cx={23.2} cy={3.2} r={0.9} fill="#FFFFFF" opacity={0.5} />
        </G>
      );
    case 'cap':
      return (
        <G>
          <Path d="M12.2 17.8C12.2 9.2 17.4 6.4 24 6.4S35.8 9.2 35.8 17.8Z" fill={`url(#${id}-acc)`} />
          <Path d="M24 6.6V17.6M17.6 8.4C16.6 11 16.4 14 16.6 17.6M30.4 8.4C31.4 11 31.6 14 31.4 17.6" stroke={dark} strokeWidth={0.45} fill="none" opacity={0.7} />
          <Path d="M11.6 17.2C16.4 15.4 31.6 15.4 36.4 17.2 37.6 17.6 37.4 19.4 36 19.4 31.4 18 16.6 18 12 19.4 10.6 19.4 10.4 17.6 11.6 17.2Z" fill={dark} />
          <Path d="M14 17.4C19 16.4 29 16.4 34 17.4" stroke="#FFFFFF" strokeWidth={0.5} opacity={0.3} fill="none" />
          <Circle cx={24} cy={6.7} r={0.9} fill={dark} />
          <Path d="M17.6 10.4C19.6 8.6 22 8 24 8" stroke="#FFFFFF" strokeWidth={0.9} opacity={0.35} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'bandana':
      return (
        <G>
          <Path d="M12.4 15.8C19.6 13.4 28.4 13.4 35.6 15.8L35.2 18.6C28.2 16.6 19.8 16.6 12.8 18.6Z" fill={c} />
          <Path d="M35.2 16.4L38.8 18.6 35.8 19.8Z" fill={dark} />
          {[16, 20, 24, 28, 32].map((x, i) => (
            <Circle key={x} cx={x} cy={16.4 - (i === 2 ? 0.5 : i === 1 || i === 3 ? 0.35 : 0)} r={0.45} fill="#FFFFFF" />
          ))}
        </G>
      );
    case 'crown':
      return (
        <G>
          <Path d="M15.6 10.2L16.8 2.6 20.6 6.4 24 0.6 27.4 6.4 31.2 2.6 32.4 10.2Z" fill={`url(#${id}-gold)`} stroke={GOLD[2]} strokeWidth={0.6} strokeLinejoin="round" />
          <Rect x={15.4} y={9.2} width={17.2} height={2} rx={0.8} fill={`url(#${id}-gold)`} stroke={GOLD[2]} strokeWidth={0.4} />
          <Circle cx={24} cy={6} r={1.1} fill="#E63946" />
          <Circle cx={19.4} cy={7.8} r={0.75} fill="#4CC9F0" />
          <Circle cx={28.6} cy={7.8} r={0.75} fill="#4CC9F0" />
          <Path d="M17.4 4.2L18 8M23.4 2.4L23.8 4.8" stroke="#FFFFFF" strokeWidth={0.5} opacity={0.7} strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

function headphones(look: Look, id: string): ReactNode {
  if (look.acc !== 'headphones') return null;
  const c = look.accColor;
  return (
    <G>
      <Path d="M11.6 23C10.4 11.4 16.4 4.6 24 4.6S37.6 11.4 36.4 23" stroke={mix(c, '#000000', 0.25)} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M12.8 18C13.4 10.4 18 6 24 5.8" stroke={mix(c, '#FFFFFF', 0.35)} strokeWidth={0.7} fill="none" strokeLinecap="round" opacity={0.8} />
      {[1, -1].map((s) => (
        <G key={s} transform={s === -1 ? 'translate(48 0) scale(-1 1)' : undefined}>
          <Rect x={8.4} y={18.2} width={5.6} height={9.8} rx={2.6} fill={`url(#${id}-acc)`} stroke={INK} strokeWidth={0.4} />
          <Rect x={12.4} y={19.4} width={2.2} height={7.4} rx={1.1} fill="#1F2937" />
          <Path d="M9.6 20.2C9.6 19.6 10 19.2 10.6 19.2" stroke="#FFFFFF" strokeWidth={0.6} opacity={0.6} strokeLinecap="round" fill="none" />
        </G>
      ))}
    </G>
  );
}

function earrings(kind: Look['earrings'], id: string): ReactNode {
  if (!kind) return null;
  const gold = `url(#${id}-gold)`;
  return (
    <G>
      {[12.6, 35.4].map((x) =>
        kind === 'hoops' ? (
          <Circle key={x} cx={x} cy={28} r={2.1} stroke={gold} strokeWidth={0.95} fill="none" />
        ) : kind === 'studs' ? (
          <G key={x}>
            <Circle cx={x} cy={26.2} r={0.8} fill={gold} />
            <Circle cx={x - 0.25} cy={25.95} r={0.25} fill="#FFFFFF" />
          </G>
        ) : (
          <G key={x}>
            <Circle cx={x} cy={26.1} r={0.55} fill={gold} />
            <Path d={`M${x} 26.4V28.4`} stroke={gold} strokeWidth={0.4} />
            <Path d={`M${x} 28.2C${x + 1} 29.2 ${x + 0.9} 30.6 ${x} 30.8 ${x - 0.9} 30.6 ${x - 1} 29.2 ${x} 28.2Z`} fill="#FFF4E6" stroke={gold} strokeWidth={0.35} />
          </G>
        ),
      )}
    </G>
  );
}

function necklace(kind: Look['necklace'], id: string): ReactNode {
  if (!kind) return null;
  const gold = `url(#${id}-gold)`;
  if (kind === 'chain') {
    return (
      <G>
        <Path d="M18.8 41C20.4 45.4 27.6 45.4 29.2 41" stroke={gold} strokeWidth={0.55} fill="none" />
        <Circle cx={24} cy={44.4} r={0.9} fill={gold} />
      </G>
    );
  }
  if (kind === 'layered') {
    return (
      <G>
        <Path d="M19.2 40.6C20.8 43.2 27.2 43.2 28.8 40.6" stroke={gold} strokeWidth={0.5} fill="none" />
        <Path d="M18.4 41.2C19.6 47.2 28.4 47.2 29.6 41.2" stroke={gold} strokeWidth={0.45} fill="none" strokeDasharray="0.9 0.35" />
        <Circle cx={24} cy={42.6} r={0.55} fill={gold} />
        <Path d="M24 45.4L24.9 46.6 24 47.8 23.1 46.6Z" fill={gold} />
      </G>
    );
  }
  return (
    <G>
      <Path d="M18.8 41C20.4 45.8 27.6 45.8 29.2 41" stroke={gold} strokeWidth={0.5} fill="none" />
      <Path d="M24 44.6C25.1 45.8 25.1 47.4 24 47.9 22.9 47.4 22.9 45.8 24 44.6Z" fill="#E63946" stroke={gold} strokeWidth={0.4} />
      <Circle cx={23.6} cy={46.2} r={0.3} fill="#FFFFFF" opacity={0.8} />
    </G>
  );
}

const PHONE: Record<NonNullable<Gear['phone']>, [string, string]> = {
  titanium: ['#B4AFA7', '#77726B'],
  midnight: ['#3A3E47', '#16181D'],
  pink: ['#F8D3D8', '#E2A2AE'],
  gold: ['#F0DCB4', '#C9A86A'],
};
const WATCH: Record<NonNullable<Gear['watch']>, string> = { midnight: '#23262D', starlight: '#E9E2D6', gold: '#D9B26B', pink: '#F2B8C6' };
const BAG: Record<NonNullable<Gear['bag']>, { body: string; trim: string; chain: boolean }> = {
  quilted: { body: '#1E1E22', trim: '#3A3A42', chain: true },
  monogram: { body: '#6B4423', trim: '#D8B07A', chain: false },
  mini: { body: '#F4A7C0', trim: '#FFD3E1', chain: false },
  croc: { body: '#F4F0E8', trim: '#D9D2C4', chain: false },
};

/** A designer bag on the shoulder: strap over the left shoulder, bag at the bottom corner. */
function bag(kind: Gear['bag'], id: string): ReactNode {
  if (!kind) return null;
  const b = BAG[kind];
  const gold = `url(#${id}-gold)`;
  return (
    <G>
      <Path d="M15 40.8C12 44 9.6 47.6 8.4 50.4" stroke={b.chain ? gold : mix(b.body, '#000000', 0.25)} strokeWidth={b.chain ? 0.9 : 1.2} strokeDasharray={b.chain ? '1 0.45' : undefined} fill="none" />
      <Path d="M1.6 50.6C1.6 49.8 2.2 49.2 3 49.2H13C13.8 49.2 14.4 49.8 14.4 50.6L14.8 56H1.2Z" fill={b.body} stroke="#000000" strokeOpacity={0.3} strokeWidth={0.4} />
      {kind === 'quilted'
        ? [3.6, 6.6, 9.6, 12.6].map((x) => <Path key={x} d={`M${x - 2} 56L${x + 1.5} 49.4M${x + 1.5} 56L${x - 2} 49.4`} stroke={b.trim} strokeWidth={0.35} />)
        : null}
      {kind === 'monogram'
        ? [3.4, 6.4, 9.4, 12.4].flatMap((x) => [51.2, 53.8].map((y) => <Path key={`${x}-${y}`} d={`M${x} ${y - 0.6}L${x + 0.6} ${y}L${x} ${y + 0.6}L${x - 0.6} ${y}Z`} fill={b.trim} opacity={0.85} />))
        : null}
      {kind === 'croc'
        ? [2.6, 5, 7.4, 9.8, 12.2].flatMap((x, i) => [50.6, 52.8, 55].map((y) => <Rect key={`${x}-${y}`} x={x + (i % 2) * 0.6} y={y} width={1.8} height={1.4} rx={0.6} fill={b.trim} />))
        : null}
      {kind === 'mini' ? <Path d="M4.6 49.4C4.6 46.6 11.4 46.6 11.4 49.4" stroke={b.trim} strokeWidth={0.9} fill="none" /> : null}
      <Path d="M1.4 50.6H14.6" stroke={b.trim} strokeWidth={0.6} opacity={0.8} />
      <Rect x={6.6} y={50.2} width={3.2} height={2} rx={0.5} fill={gold} />
      <Path d="M3 51.6L4.6 50.2" stroke="#FFFFFF" strokeWidth={0.5} opacity={0.35} strokeLinecap="round" />
    </G>
  );
}

/** A hand at the chest: holding the phone up, with the watch on the wrist. */
function handGear(gear: Gear | undefined, skin: string, id: string): ReactNode {
  if (!gear || (!gear.phone && !gear.watch)) return null;
  const skinDark = mix(skin, '#000000', 0.15);
  return (
    <G>
      {/* Forearm in a sleeve going off the bottom */}
      <Path d="M36.6 56L38.6 50.4" stroke={mix(skin, '#000000', 0.08)} strokeWidth={3.4} strokeLinecap="round" />
      {gear.watch ? (
        <G>
          <Path d="M36.8 52.4L40.4 53.6" stroke={WATCH[gear.watch]} strokeWidth={1.6} strokeLinecap="round" />
          <Rect x={37.2} y={51.4} width={2.8} height={3.2} rx={0.9} fill="#111317" stroke={WATCH[gear.watch]} strokeWidth={0.45} transform="rotate(18 38.6 53)" />
          <Circle cx={38.6} cy={53} r={0.65} fill="none" stroke="#7CF29C" strokeWidth={0.35} />
        </G>
      ) : null}
      {gear.phone ? (
        <G transform="rotate(-10 38.4 44.6)">
          <Rect x={35.4} y={38.6} width={6.2} height={11.6} rx={1.4} fill={`url(#${id}-phone)`} stroke="#000000" strokeOpacity={0.35} strokeWidth={0.35} />
          <Rect x={36} y={39.2} width={3} height={3} rx={0.8} fill={mix(PHONE[gear.phone][1], '#000000', 0.2)} />
          <Circle cx={36.8} cy={40} r={0.55} fill="#0C0D10" stroke="#5B5F68" strokeWidth={0.2} />
          <Circle cx={38.2} cy={40} r={0.55} fill="#0C0D10" stroke="#5B5F68" strokeWidth={0.2} />
          <Circle cx={36.8} cy={41.4} r={0.55} fill="#0C0D10" stroke="#5B5F68" strokeWidth={0.2} />
          <Circle cx={38.3} cy={41.5} r={0.25} fill="#FFF4D6" />
          <Path d="M40.6 39.6V45" stroke="#FFFFFF" strokeWidth={0.4} opacity={0.4} strokeLinecap="round" />
        </G>
      ) : null}
      {/* Fingers wrapped around it */}
      <Ellipse cx={38.4} cy={49.8} rx={2.6} ry={2.1} fill={skin} stroke={skinDark} strokeWidth={0.35} />
      {gear.phone ? (
        <G fill={skin} stroke={skinDark} strokeWidth={0.3}>
          <Ellipse cx={41.2} cy={46.6} rx={1} ry={0.75} />
          <Ellipse cx={41.4} cy={48.2} rx={1} ry={0.75} />
          <Ellipse cx={35.6} cy={47.6} rx={0.9} ry={1.2} />
        </G>
      ) : null}
    </G>
  );
}

/** A slim planner headset: earpiece on the left ear, mic at the mouth. */
function headset(gear: Gear | undefined): ReactNode {
  if (!gear?.headset) return null;
  return (
    <G>
      <Path d="M12.6 23.4C12.8 27.6 15.8 30.4 20.2 30.3" stroke="#1B1B1F" strokeWidth={0.75} fill="none" strokeLinecap="round" />
      <Rect x={10.6} y={20.4} width={3} height={4.6} rx={1.4} fill="#1B1B1F" />
      <Circle cx={20.6} cy={30.2} r={0.75} fill="#FF4D8D" />
    </G>
  );
}

// ─── The bust ─────────────────────────────────────────────────────────────

type BustProps = { look: Look; expr: Expression; id: string };

/** Head and shoulders, for seated guests and portraits (48 × 56). */
export function BustArt({ look, expr, id }: BustProps) {
  const r = resolve(look);
  const skinLight = mix(look.skin, '#FFFFFF', 0.2);
  const skinDark = mix(look.skin, '#000000', 0.16);
  const neckTop = mix(look.skin, '#000000', 0.3);
  const neckBottom = mix(look.skin, '#000000', 0.12);
  const hairFill = `url(#${id}-hair)`;
  const blush = { love: 1, happy: 0.95, ok: 0.65, meh: 0.4, mad: 0.75, shock: 0.5 }[expr];
  const face = r.faceWidth === 1 ? undefined : `translate(24 0) scale(${r.faceWidth} 1) translate(-24 0)`;
  return (
    <G>
      <Defs>
        <RadialGradient id={`${id}-skin`} cx="0.42" cy="0.36" r="0.72">
          <Stop offset="0" stopColor={skinLight} />
          <Stop offset="0.55" stopColor={look.skin} />
          <Stop offset="1" stopColor={skinDark} />
        </RadialGradient>
        <LinearGradient id={`${id}-neck`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={neckTop} />
          <Stop offset="1" stopColor={neckBottom} />
        </LinearGradient>
        <LinearGradient id={`${id}-hair`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mix(look.hairColor, '#FFFFFF', 0.28)} />
          <Stop offset="0.45" stopColor={look.hairColor} />
          <Stop offset="1" stopColor={mix(look.hairColor, '#000000', 0.32)} />
        </LinearGradient>
        <LinearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mix(look.top, '#FFFFFF', 0.14)} />
          <Stop offset="1" stopColor={mix(look.top, '#000000', 0.24)} />
        </LinearGradient>
        <RadialGradient id={`${id}-iris`} cx="0.5" cy="0.45" r="0.55">
          <Stop offset="0" stopColor={mix(r.eyes, '#FFFFFF', 0.35)} />
          <Stop offset="0.6" stopColor={r.eyes} />
          <Stop offset="1" stopColor={mix(r.eyes, '#000000', 0.5)} />
        </RadialGradient>
        <LinearGradient id={`${id}-sclera`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E4DEEA" />
          <Stop offset="0.45" stopColor="#FFFFFF" />
        </LinearGradient>
        <RadialGradient id={`${id}-blush`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FF5E86" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FF5E86" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}-lens`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mix(look.accColor, '#000000', 0.25)} />
          <Stop offset="1" stopColor={mix(look.accColor, '#FFFFFF', 0.3)} />
        </LinearGradient>
        <LinearGradient id={`${id}-acc`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mix(look.accColor, '#FFFFFF', 0.22)} />
          <Stop offset="1" stopColor={mix(look.accColor, '#000000', 0.2)} />
        </LinearGradient>
        <LinearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD[0]} />
          <Stop offset="0.5" stopColor={GOLD[1]} />
          <Stop offset="1" stopColor={GOLD[2]} />
        </LinearGradient>
        <RadialGradient id={`${id}-heart`} cx="0.4" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#FF8FA8" />
          <Stop offset="1" stopColor="#E0193F" />
        </RadialGradient>
        <LinearGradient id={`${id}-phone`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={PHONE[look.gear?.phone ?? 'titanium'][0]} />
          <Stop offset="1" stopColor={PHONE[look.gear?.phone ?? 'titanium'][1]} />
        </LinearGradient>
        <ClipPath id={`${id}-torso`}>
          <Path d={TORSO} />
        </ClipPath>
      </Defs>

      <G transform={face}>{hairBack(look, hairFill)}</G>

      {/* Shoulders and outfit */}
      <Path d={TORSO} fill={`url(#${id}-top)`} />
      <G clipPath={`url(#${id}-torso)`}>{torsoPattern(look)}</G>
      <Path d="M5.6 51C7.4 46 11.4 43.2 16.8 42.2" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.16} fill="none" strokeLinecap="round" />
      <Path d="M14.4 56C14.8 52.4 15.6 49.6 17 47.4M33.6 56C33.2 52.4 32.4 49.6 31 47.4" stroke="#000000" strokeWidth={0.6} opacity={0.12} fill="none" />

      {/* Neck */}
      <Path d="M19.4 29.5H28.6L29 39.6C26.8 41.4 21.2 41.4 19 39.6Z" fill={`url(#${id}-neck)`} />
      {neckline(look, r.neck, neckBottom)}
      {necklace(r.necklace, id)}
      {bag(look.gear?.bag, id)}
      {handGear(look.gear, look.skin, id)}

      <G transform={face}>
        {/* Ears (long hair covers them) */}
        {(look.hair === 'long' || look.hair === 'bob' || look.hair === 'waves' ? [] : ([1, -1] as const)).map((s) => (
          <G key={s} transform={s === -1 ? 'translate(48 0) scale(-1 1)' : undefined}>
            <Path d="M12.9 19.4C10.6 18.8 9.8 21.4 10.4 23.6S12.2 26.6 13.4 26.2Z" fill={skinDark} />
            <Path d="M12.3 21C11.3 21.4 11.2 23 11.8 24.2" stroke={mix(look.skin, '#000000', 0.32)} strokeWidth={0.45} fill="none" opacity={0.7} />
          </G>
        ))}

        {/* Head */}
        <Path
          d="M24 8.4C31.2 8.4 35.6 13.4 35.6 20.4 35.6 26.2 33.4 30.6 30.2 32.9 28.4 34.2 26.3 34.9 24 34.9S19.6 34.2 17.8 32.9C14.6 30.6 12.4 26.2 12.4 20.4 12.4 13.4 16.8 8.4 24 8.4Z"
          fill={`url(#${id}-skin)`}
        />
        <Circle cx={16.4} cy={26.6} r={3.4} fill={`url(#${id}-blush)`} opacity={blush} />
        <Circle cx={31.6} cy={26.6} r={3.4} fill={`url(#${id}-blush)`} opacity={blush} />
        {look.freckles ? (
          <G fill={mix(look.skin, '#000000', 0.38)} opacity={0.65}>
            {[
              [16.6, 25.6],
              [17.9, 26.6],
              [15.6, 26.9],
              [31.4, 25.6],
              [30.1, 26.6],
              [32.4, 26.9],
              [22.8, 25],
              [25.2, 25],
            ].map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.36} />
            ))}
          </G>
        ) : null}
        {look.beard ? (
          <G>
            <Path
              d="M13.2 24.5C13.6 30.4 17.4 35.6 24 35.6S34.4 30.4 34.8 24.5C33.6 27.8 32 30 30 31 28.6 29.6 26.4 29 24 29S19.4 29.6 18 31C16 30 14.4 27.8 13.2 24.5Z"
              fill={hairFill}
              opacity={0.95}
            />
            <Path d="M20.4 29.4C22 28.2 23.2 28.4 24 28.9 24.8 28.4 26 28.2 27.6 29.4 26 29.8 25 29.6 24 29.3 23 29.6 22 29.8 20.4 29.4Z" fill={look.hairColor} />
          </G>
        ) : null}

        {/* Nose */}
        <Ellipse cx={24} cy={24} rx={0.7} ry={2.2} fill="#FFFFFF" opacity={0.16} />
        <Path d="M25.1 23.4C25.6 24.8 26 25.8 25.6 26.6" stroke={mix(look.skin, '#000000', 0.25)} strokeWidth={0.6} fill="none" opacity={0.45} strokeLinecap="round" />
        <Path d="M22.6 26.9C23.2 27.6 24.8 27.6 25.4 26.9" stroke={mix(look.skin, '#000000', 0.35)} strokeWidth={0.7} fill="none" opacity={0.75} strokeLinecap="round" />
        <Ellipse cx={24.1} cy={26.1} rx={0.8} ry={0.5} fill="#FFFFFF" opacity={0.28} />

        {/* Eyes, makeup and brows */}
        {r.makeup !== 'natural' && expr !== 'happy' && expr !== 'love' ? (
          <G opacity={r.makeup === 'lite' ? 0.4 : 0.6}>
            {[19.3, 28.7].map((x) => (
              <Ellipse
                key={x}
                cx={x}
                cy={20.6}
                rx={3.6}
                ry={1.7}
                fill={r.makeup === 'glam' ? '#C9976A' : r.makeup === 'bold' ? mix(r.lips, '#000000', 0.35) : mix(r.lips, '#FFFFFF', 0.25)}
              />
            ))}
            {r.makeup === 'glam' ? [19.8, 29.2].map((x) => <Ellipse key={`s${x}`} cx={x} cy={20.2} rx={1.2} ry={0.5} fill="#FFF1D2" opacity={0.9} />) : null}
          </G>
        ) : null}
        {r.makeup === 'glam' || r.makeup === 'bold' ? (
          <G opacity={0.5}>
            <Ellipse cx={17.2} cy={24.6} rx={1.8} ry={0.6} fill="#FFF6E8" transform="rotate(-18 17.2 24.6)" />
            <Ellipse cx={30.8} cy={24.6} rx={1.8} ry={0.6} fill="#FFF6E8" transform="rotate(18 30.8 24.6)" />
            <Ellipse cx={24} cy={23.4} rx={0.45} ry={1.8} fill="#FFFFFF" />
          </G>
        ) : null}
        {eye(1, expr, id, look.skin, r.lashes, r.makeup)}
        {eye(-1, expr, id, look.skin, r.lashes, r.makeup)}
        {brows(expr, r.brow)}

        {mouth(expr, r.lips, r.makeup === 'glam' || r.makeup === 'bold')}

        {/* Hair, then whatever's on their head */}
        {hairFront(look, hairFill)}
        {hairShine(look)}
        {faceGear(look, id)}
        {headGear(look, id)}
        {headphones(look, id)}
        {headset(look.gear)}
        {earrings(r.earrings, id)}
      </G>
    </G>
  );
}

/** A creator's portrait at any size. */
export const Avatar = memo(function Avatar({ look, expr = 'ok', size = 48, id }: { look: Look; expr?: Expression; size?: number; id: string }) {
  return (
    <Svg width={size} height={(size * 56) / 48} viewBox="0 0 48 56">
      <BustArt look={look} expr={expr} id={id} />
    </Svg>
  );
});

/** A round profile picture (head and shoulders cropped in a circle). */
export const ProfilePic = memo(function ProfilePic({
  look,
  size = 44,
  id,
  ring = '#FF4D8D',
  bg = '#33264A',
  expr = 'happy',
}: {
  look: Look;
  size?: number;
  id: string;
  ring?: string;
  bg?: string;
  expr?: Expression;
}) {
  const clip = `pic-${id}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id={clip}>
          <Circle cx={24} cy={24} r={22} />
        </ClipPath>
        <RadialGradient id={`${clip}-bg`} cx="0.5" cy="0.3" r="0.7">
          <Stop offset="0" stopColor={mix(bg, '#FFFFFF', 0.18)} />
          <Stop offset="1" stopColor={bg} />
        </RadialGradient>
      </Defs>
      <Circle cx={24} cy={24} r={23} fill={ring} />
      <Circle cx={24} cy={24} r={22} fill={`url(#${clip}-bg)`} />
      <G clipPath={`url(#${clip})`}>
        <G transform="translate(0 2)">
          <BustArt look={look} expr={expr} id={`${id}-p`} />
        </G>
      </G>
    </Svg>
  );
});
