import { memo, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import type { Look } from '@/features/celeb-dash/engine/types';

/**
 * Every creator is drawn from their `Look`: skin, one of twelve hairstyles,
 * outfit with a pattern, an accessory, and a face that changes with how the
 * night is going.
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

/** Slightly darker version of a hex color, for shading. */
export function shade(hex: string, amount = 0.18): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const INK = '#1B1426';

// Head: centered at (24, 22), 22 wide, 25 tall.
function hairBack(look: Look): ReactNode {
  const c = look.hairColor;
  switch (look.hair) {
    case 'long':
      return <Path d="M11 20C10 9 16 6.5 24 6.5S38 9 37 20l2 26c-5 2-9 0-10-2H19c-1 2-5 4-10 2z" fill={c} />;
    case 'bob':
      return <Path d="M10.5 22C10 10 16 7 24 7s14 3 13.5 15l.5 11c-4 2-7 1-8 0H18c-1 1-4 2-8 0z" fill={c} />;
    case 'afro':
      return (
        <G fill={c}>
          <Circle cx={24} cy={17} r={15.5} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
            const a = (Math.PI * 2 * i) / 10;
            return <Circle key={i} cx={24 + Math.cos(a) * 14.5} cy={17 + Math.sin(a) * 14.5} r={4.2} />;
          })}
        </G>
      );
    case 'ponytail':
      return <Path d="M31 11c9 0 12 10 10 22-1 7-5 9-7 6 3-8 2-18-3-22z" fill={c} />;
    case 'braids':
      return (
        <G fill={c}>
          {[22, 26, 30, 34, 38, 42].map((y) => (
            <G key={y}>
              <Ellipse cx={12.2} cy={y} rx={2.8} ry={2.3} />
              <Ellipse cx={35.8} cy={y} rx={2.8} ry={2.3} />
            </G>
          ))}
          <Circle cx={12.2} cy={45} r={1.4} fill="#FFD166" />
          <Circle cx={35.8} cy={45} r={1.4} fill="#FFD166" />
        </G>
      );
    case 'waves':
      return <Path d="M11 20C10 9 16 7 24 7s14 2 13 13l1.5 16c-1.5 2-3 1-4 2-1.5-1.6-2.5-1-4 0H18.5c-1.5-1-2.5-1.6-4 0-1-1-2.5 0-4-2z" fill={c} />;
    case 'bun':
      return (
        <G>
          <Circle cx={24} cy={6.5} r={6} fill={c} />
          <Path d="M19.5 10.5c3 1.2 6 1.2 9 0" stroke={shade(c, 0.35)} strokeWidth={1.4} fill="none" />
        </G>
      );
    default:
      return null;
  }
}

function hairFront(look: Look): ReactNode {
  const c = look.hairColor;
  const dark = shade(c, 0.25);
  switch (look.hair) {
    case 'bun':
    case 'ponytail':
      return (
        <G>
          <Path d="M12.5 22C12 12 17 8.5 24 8.5S36 12 35.5 22c-2.5-6-6.5-8-11.5-8s-9 2-11.5 8z" fill={c} />
          <Path d="M16 12.5c3-2 9-2.6 13-.6" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1.2} fill="none" />
        </G>
      );
    case 'long':
      return <Path d="M12.5 24C11.5 12 17 8 24 8c8 0 12.5 4 11.5 14-4.5-7-13.5-9-19.5-6-1.5 2-2.5 5-3.5 8z" fill={c} />;
    case 'bob':
      return <Path d="M12.5 22C12 11 17 8 24 8s12 3 11.5 14l-.5-4.5c-5-1.4-17-1.4-22 0z" fill={c} />;
    case 'afro':
      return <Path d="M13 20c1-7 6-9 11-9s10 2 11 9c-2-4-6-5-11-5s-9 1-11 5z" fill={dark} />;
    case 'buzz':
      return <Path d="M13 20c0-9 5-11 11-11s11 2 11 11c-3-4-7-5-11-5s-8 1-11 5z" fill={c} opacity={0.75} />;
    case 'fade':
      return (
        <G>
          <Path d="M13 21c0-3 .2-5 .5-6l1.5 6zM35 21c0-3-.2-5-.5-6l-1.5 6z" fill={c} opacity={0.45} />
          <Path d="M13.5 19c0-8 4.5-10.5 10.5-10.5S34.5 11 34.5 19c-2.5-3.5-6.5-4.5-10.5-4.5S16 15.5 13.5 19z" fill={c} />
        </G>
      );
    case 'braids':
      return (
        <G>
          <Path d="M12.5 22C12 12 17 8.5 24 8.5S36 12 35.5 22c-2.5-6-6.5-8-11.5-8s-9 2-11.5 8z" fill={c} />
          <Path d="M24 8.6v5.6" stroke={dark} strokeWidth={1} />
          <Path d="M15 12.5l2 1.5M33 12.5l-2 1.5M18.5 10l1.5 2M29.5 10 28 12" stroke={dark} strokeWidth={0.9} />
        </G>
      );
    case 'waves':
      return <Path d="M12.5 23c-.5-11 5-14.5 11.5-14.5S36 12 35.5 23c-1-3-2-4.5-3.5-5-1 1.6-2.6 1.2-3.4 0-1.2 1.4-3 1.4-4.2 0-1.2 1.4-3 1.4-4.2 0-1 1.2-2.6 1.6-3.6 0-1.6.6-3 2-4.1 5z" fill={c} />;
    case 'spiky':
      return <Path d="M13 21l-1-8 4 2V7l4 5 3-8 3 7 4-5 1 7 5-2-1 10c-3-5-7-6-11-6s-8 1-11 6z" fill={c} />;
    case 'curtain':
      return <Path d="M12.5 24C12 12 17 8.5 24 8.5S36 12 35.5 24c-1.5-5-4.5-9.5-10.5-10.5L24 17l-1-3.5c-6 1-9 5.5-10.5 10.5z" fill={c} />;
    case 'bald':
      return <Ellipse cx={20} cy={12.5} rx={4} ry={2.2} fill="#FFFFFF" opacity={0.28} />;
  }
}

function accessory(look: Look, back: boolean): ReactNode {
  const c = look.accColor;
  switch (look.acc) {
    case 'headphones':
      return back ? (
        <Path d="M11 22c-1-9 5-15 13-15s14 6 13 15" stroke={c} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      ) : (
        <G>
          <Rect x={9} y={19} width={5.5} height={8.5} rx={2.4} fill={c} stroke={INK} strokeWidth={0.6} />
          <Rect x={33.5} y={19} width={5.5} height={8.5} rx={2.4} fill={c} stroke={INK} strokeWidth={0.6} />
        </G>
      );
    case 'hoops':
      return back ? null : (
        <G>
          <Circle cx={13} cy={28} r={2.2} stroke={c} strokeWidth={1.1} fill="none" />
          <Circle cx={35} cy={28} r={2.2} stroke={c} strokeWidth={1.1} fill="none" />
        </G>
      );
    default:
      return null;
  }
}

function faceGear(look: Look): ReactNode {
  const c = look.accColor;
  switch (look.acc) {
    case 'shades':
      return (
        <G>
          <Rect x={15.5} y={20.2} width={7.4} height={5} rx={2.2} fill={c} />
          <Rect x={25.1} y={20.2} width={7.4} height={5} rx={2.2} fill={c} />
          <Path d="M22.9 22h2.2" stroke={c} strokeWidth={1.1} />
          <Path d="M17 21.4l2 0M26.6 21.4l2 0" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.9} strokeLinecap="round" />
        </G>
      );
    case 'glasses':
      return (
        <G fill="none" stroke={c} strokeWidth={1.1}>
          <Circle cx={19.5} cy={23} r={3.3} />
          <Circle cx={28.5} cy={23} r={3.3} />
          <Path d="M22.8 23h2.4" />
        </G>
      );
    case 'visor':
      return <Rect x={14} y={19.6} width={20} height={5.6} rx={2.8} fill={c} opacity={0.82} stroke={INK} strokeWidth={0.5} />;
    case 'beanie':
      return (
        <G>
          <Path d="M12 17C12 8.5 17 6 24 6s12 2.5 12 11z" fill={c} />
          <Rect x={11.5} y={15} width={25} height={4.5} rx={2} fill={shade(c, 0.2)} />
          <Circle cx={24} cy={5.5} r={2.6} fill={shade(c, -0.3)} />
        </G>
      );
    case 'cap':
      return (
        <G>
          <Path d="M12.5 17.5C12.5 9 17.5 7 24 7s11.5 2 11.5 10.5z" fill={c} />
          <Path d="M24 17.5h15.5c.6 0 .8 1.4-.4 1.6L24 19.6z" fill={shade(c, 0.25)} />
          <Circle cx={24} cy={7.6} r={1} fill={shade(c, 0.3)} />
        </G>
      );
    case 'bandana':
      return (
        <G>
          <Path d="M12.6 16.5c7-2.6 15.8-2.6 22.8 0l-.4 3c-7-2-15-2-22 0z" fill={c} />
          <Path d="M35 17.5l3.5 2.5-3 .8" fill={c} />
          <Circle cx={18} cy={17} r={0.6} fill="#FFFFFF" />
          <Circle cx={24} cy={16.2} r={0.6} fill="#FFFFFF" />
          <Circle cx={30} cy={17} r={0.6} fill="#FFFFFF" />
        </G>
      );
    case 'crown':
      return (
        <G>
          <Path d="M15.5 11 17 3.5l3.8 4L24 1.5l3.2 6 3.8-4 1.5 7.5z" fill="#FFD166" stroke="#B7791F" strokeWidth={0.8} strokeLinejoin="round" />
          <Circle cx={24} cy={7.6} r={1.1} fill="#E63946" />
          <Circle cx={19.4} cy={8.8} r={0.8} fill="#4CC9F0" />
          <Circle cx={28.6} cy={8.8} r={0.8} fill="#4CC9F0" />
        </G>
      );
    default:
      return null;
  }
}

function eyes(expr: Expression, look: Look): ReactNode {
  const hideEyes = look.acc === 'shades' || look.acc === 'visor';
  const brow = shade(look.hairColor === '#F2EAD8' ? '#B8A98A' : look.hairColor, 0.1);
  const browPaths: Record<Expression, string> = {
    love: 'M16.8 19.4q2.6-1.4 5 0M26.2 19.4q2.4-1.4 5 0',
    happy: 'M16.8 19.2q2.6-1.6 5 0M26.2 19.2q2.4-1.6 5 0',
    ok: 'M17 19.6h4.6M26.4 19.6H31',
    meh: 'M17 20.2l4.6-.4M26.4 19.8l4.6.4',
    mad: 'M16.8 18.6l5 2M31.2 18.6l-5 2',
    shock: 'M16.8 18.4q2.6-1.6 5 0M26.2 18.4q2.4-1.6 5 0',
  };
  const brows = <Path d={browPaths[expr]} stroke={brow} strokeWidth={1.2} strokeLinecap="round" fill="none" />;
  if (hideEyes) return <G>{look.acc === 'visor' ? null : brows}</G>;
  let e: ReactNode;
  switch (expr) {
    case 'love':
      e = (
        <G fill="#FF2E63">
          <Path d="M19.5 25.2l-2.1-2a1.2 1.2 0 0 1 2.1-1.6 1.2 1.2 0 0 1 2.1 1.6z" />
          <Path d="M28.5 25.2l-2.1-2a1.2 1.2 0 0 1 2.1-1.6 1.2 1.2 0 0 1 2.1 1.6z" />
        </G>
      );
      break;
    case 'happy':
      e = <Path d="M17.8 23.6q1.7-2.2 3.4 0M26.8 23.6q1.7-2.2 3.4 0" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />;
      break;
    case 'meh':
      e = (
        <G>
          <Ellipse cx={19.5} cy={23.4} rx={1.5} ry={0.9} fill={INK} />
          <Ellipse cx={28.5} cy={23.4} rx={1.5} ry={0.9} fill={INK} />
        </G>
      );
      break;
    case 'shock':
      e = (
        <G>
          <Circle cx={19.5} cy={23} r={2} fill="#FFFFFF" stroke={INK} strokeWidth={0.6} />
          <Circle cx={28.5} cy={23} r={2} fill="#FFFFFF" stroke={INK} strokeWidth={0.6} />
          <Circle cx={19.5} cy={23} r={0.9} fill={INK} />
          <Circle cx={28.5} cy={23} r={0.9} fill={INK} />
        </G>
      );
      break;
    default:
      e = (
        <G>
          <Ellipse cx={19.5} cy={23} rx={1.5} ry={1.8} fill={INK} />
          <Ellipse cx={28.5} cy={23} rx={1.5} ry={1.8} fill={INK} />
          <Circle cx={20} cy={22.3} r={0.5} fill="#FFFFFF" />
          <Circle cx={29} cy={22.3} r={0.5} fill="#FFFFFF" />
        </G>
      );
  }
  return (
    <G>
      {brows}
      {e}
    </G>
  );
}

function mouth(expr: Expression, look: Look): ReactNode {
  const lip = look.lips ?? '#B5485D';
  switch (expr) {
    case 'love':
    case 'happy':
      return (
        <G>
          <Path d="M20.4 28.2q3.6 5 7.2 0z" fill="#7A1F2B" stroke={lip} strokeWidth={0.9} strokeLinejoin="round" />
          <Path d="M21.4 28.4h5.2" stroke="#FFFFFF" strokeWidth={1} />
        </G>
      );
    case 'ok':
      return <Path d="M21 28.6q3 2.6 6 0" stroke={lip} strokeWidth={1.3} strokeLinecap="round" fill="none" />;
    case 'meh':
      return <Path d="M21.6 29.6h4.8" stroke={lip} strokeWidth={1.3} strokeLinecap="round" />;
    case 'shock':
      return <Ellipse cx={24} cy={29.6} rx={1.8} ry={2.2} fill="#7A1F2B" stroke={lip} strokeWidth={0.8} />;
    case 'mad':
      return <Path d="M21 30.6q3-2.6 6 0" stroke={lip} strokeWidth={1.4} strokeLinecap="round" fill="none" />;
  }
}

function torsoPattern(look: Look): ReactNode {
  const a = look.topAccent;
  switch (look.pattern) {
    case 'stripes':
      return (
        <G stroke={a} strokeWidth={2}>
          {[42, 46.5, 51, 55.5].map((y) => (
            <Line key={y} x1={0} y1={y} x2={48} y2={y} />
          ))}
        </G>
      );
    case 'dots':
      return (
        <G fill={a}>
          {[
            [10, 48],
            [17, 44],
            [24, 50],
            [31, 44],
            [38, 48],
            [14, 54],
            [28, 55],
            [36, 54],
          ].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />
          ))}
        </G>
      );
    case 'sequins':
      return (
        <G>
          {Array.from({ length: 22 }, (_, i) => {
            const x = 6 + ((i * 7.3) % 36);
            const y = 42 + ((i * 3.7) % 14);
            return <Circle key={i} cx={x} cy={y} r={0.9} fill={i % 3 === 0 ? '#FFFFFF' : a} opacity={i % 2 ? 0.9 : 0.6} />;
          })}
        </G>
      );
    case 'check':
      return (
        <G stroke={a} strokeWidth={1} opacity={0.7}>
          {[8, 14, 20, 26, 32, 38].map((x) => (
            <Line key={`v${x}`} x1={x} y1={38} x2={x} y2={56} />
          ))}
          {[43, 49, 55].map((y) => (
            <Line key={`h${y}`} x1={0} y1={y} x2={48} y2={y} />
          ))}
        </G>
      );
    case 'zip':
      return (
        <G>
          <Path d="M17 39.5l7 7 7-7" stroke={a} strokeWidth={2.2} fill="none" />
          <Line x1={24} y1={46.5} x2={24} y2={56} stroke={a} strokeWidth={1.2} />
          <Rect x={23} y={47} width={2} height={3} rx={0.6} fill={a} />
        </G>
      );
    default:
      return <Path d="M17 39.5q7 5 14 0" stroke={a} strokeWidth={1.8} fill="none" />;
  }
}

type BustProps = { look: Look; expr: Expression; id: string };

/** Head and shoulders, as seated guests and portraits. Drawn on a 48 × 56 grid. */
export function BustArt({ look, expr, id }: BustProps) {
  const skinShade = shade(look.skin, 0.14);
  const clip = `torso-${id}`;
  const showBlush = expr === 'happy' || expr === 'love';
  return (
    <G>
      <Defs>
        <ClipPath id={clip}>
          <Path d="M4 56C4 44 12 39 24 39s20 5 20 17z" />
        </ClipPath>
      </Defs>
      {hairBack(look)}
      {accessory(look, true)}
      {/* Torso */}
      <Path d="M4 56C4 44 12 39 24 39s20 5 20 17z" fill={look.top} stroke={INK} strokeWidth={0.8} />
      <G clipPath={`url(#${clip})`}>{torsoPattern(look)}</G>
      {/* Neck */}
      <Path d="M20 31h8v8.5q-4 3-8 0z" fill={skinShade} />
      {/* Ears and head */}
      <Ellipse cx={13.2} cy={23.5} rx={2} ry={2.8} fill={skinShade} />
      <Ellipse cx={34.8} cy={23.5} rx={2} ry={2.8} fill={skinShade} />
      <Ellipse cx={24} cy={22} rx={11} ry={12.5} fill={look.skin} />
      {look.beard ? (
        <G>
          <Path d="M13.5 24c.5 9 4.5 12.5 10.5 12.5s10-3.5 10.5-12.5c-1.5 5-4.5 7-10.5 7s-9-2-10.5-7z" fill={look.hairColor} opacity={0.92} />
          <Path d="M20 27.2q4-1.8 8 0" stroke={look.hairColor} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </G>
      ) : null}
      {look.freckles ? (
        <G fill={shade(look.skin, 0.35)} opacity={0.7}>
          {[
            [17.5, 26],
            [19, 27.2],
            [16.4, 27.4],
            [30.5, 26],
            [29, 27.2],
            [31.6, 27.4],
          ].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.45} />
          ))}
        </G>
      ) : null}
      {showBlush ? (
        <G fill="#FF6B8B" opacity={0.35}>
          <Ellipse cx={17.2} cy={27} rx={2.1} ry={1.2} />
          <Ellipse cx={30.8} cy={27} rx={2.1} ry={1.2} />
        </G>
      ) : null}
      {eyes(expr, look)}
      {mouth(expr, look)}
      {hairFront(look)}
      {faceGear(look)}
      {accessory(look, false)}
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
      </Defs>
      <Circle cx={24} cy={24} r={23} fill={ring} />
      <Circle cx={24} cy={24} r={22} fill={bg} />
      <G clipPath={`url(#${clip})`}>
        <G transform="translate(0 2)">
          <BustArt look={look} expr={expr} id={`${id}-p`} />
        </G>
      </G>
    </Svg>
  );
});
