import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

export type DrinkKey = 'lemon_drop' | 'mojito' | 'margarita' | 'paloma' | 'espresso_tini' | 'old_fashioned' | 'french_75' | 'champagne_tower';

const GLASS = 'rgba(255,255,255,0.9)';
const EDGE = 'rgba(255,255,255,0.55)';

/** I'm In's own cocktail art for drinks sent to people who are live. */
export function DrinkIcon({ drink, size = 56 }: { drink: DrinkKey | string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {ART[drink as DrinkKey] ?? ART.margarita}
    </Svg>
  );
}

// A martini glass: bowl from (x1,top) to (x2,top) down to the stem.
const martini = (liquid: string, level = 0.8) => (
  <G>
    <Path d={`M${32 - 20 * level} ${14 + (1 - level) * 16} L${32 + 20 * level} ${14 + (1 - level) * 16} L32 34 Z`} fill={liquid} />
    <Path d="M12 14 L52 14 L32 34 Z" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
    <Line x1={32} y1={34} x2={32} y2={52} stroke={GLASS} strokeWidth={2} />
    <Path d="M22 54 Q32 50 42 54" fill="none" stroke={GLASS} strokeWidth={2.4} strokeLinecap="round" />
  </G>
);

const ART: Record<DrinkKey, React.ReactNode> = {
  lemon_drop: (
    <G>
      {martini('#FFE066')}
      {/* sugared rim */}
      {[14, 18, 22, 26, 30, 34, 38, 42, 46, 50].map((x) => (
        <Circle key={x} cx={x} cy={13.2} r={1.1} fill="#FFFFFF" />
      ))}
      {/* lemon twist */}
      <Path d="M44 8 q6 2 4 8 q-2 4 -6 2" fill="none" stroke="#FFD43B" strokeWidth={3} strokeLinecap="round" />
    </G>
  ),
  mojito: (
    <G>
      <Path d="M20 20 L44 20 L42 56 L22 56 Z" fill="rgba(180,240,190,0.55)" />
      <Rect x={24} y={34} width={7} height={7} rx={1.5} fill="rgba(255,255,255,0.6)" transform="rotate(-12 27 37)" />
      <Rect x={32} y={40} width={7} height={7} rx={1.5} fill="rgba(255,255,255,0.6)" transform="rotate(10 35 43)" />
      <Path d="M26 48 q3 -6 7 -2 q-3 5 -7 2 Z" fill="#2FB344" />
      <Path d="M33 26 q4 -5 8 -1 q-4 4 -8 1 Z" fill="#2FB344" />
      <Path d="M20 12 L44 12 L42 56 L22 56 Z" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
      <Line x1={38} y1={4} x2={34} y2={30} stroke="#FF6B6B" strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={44} cy={14} r={6} fill="#94D82D" stroke="#FFFFFF" strokeWidth={1.2} />
      <Path d="M44 8 V20 M38 14 H50 M40 10 L48 18 M48 10 L40 18" stroke="#D8F5A2" strokeWidth={0.8} />
    </G>
  ),
  margarita: (
    <G>
      <Path d="M12 16 Q32 16 52 16 Q50 26 40 28 L36 32 Q34 36 32 36 Q30 36 28 32 L24 28 Q14 26 12 16 Z" fill="#C0EB75" />
      <Path d="M12 16 Q14 26 24 28 L28 32 Q30 36 32 36 Q34 36 36 32 L40 28 Q50 26 52 16" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
      {[13, 17, 21, 25, 29, 33, 37, 41, 45, 49].map((x) => (
        <Rect key={x} x={x} y={14} width={1.8} height={1.8} fill="#FFFFFF" />
      ))}
      <Line x1={32} y1={36} x2={32} y2={52} stroke={GLASS} strokeWidth={2} />
      <Path d="M22 54 Q32 50 42 54" fill="none" stroke={GLASS} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M44 16 A8 8 0 0 1 56 8 L44 16 Z" fill="#74B816" stroke="#FFFFFF" strokeWidth={1} />
    </G>
  ),
  paloma: (
    <G>
      <Path d="M22 18 L42 18 L40 56 L24 56 Z" fill="#FFA8A8" />
      <Path d="M22 18 L42 18 L40 56 L24 56 Z" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
      {[26, 30, 34, 38].map((y, i) => (
        <Circle key={y} cx={27 + (i % 2) * 8} cy={y + 6} r={1.2} fill="rgba(255,255,255,0.8)" />
      ))}
      <Circle cx={42} cy={16} r={8} fill="#FF8787" stroke="#FFF4E6" strokeWidth={2} />
      <Path d="M42 9 V23 M35 16 H49 M37 11 L47 21 M47 11 L37 21" stroke="#FFC9C9" strokeWidth={1} />
      <Rect x={20} y={10} width={24} height={2.4} rx={1} fill={EDGE} />
    </G>
  ),
  espresso_tini: (
    <G>
      {martini('#5C3A21')}
      <Path d="M17.5 17 L46.5 17 L44 20 L20 20 Z" fill="#E8D5B7" />
      {[
        [26, 11],
        [32, 9],
        [38, 11],
      ].map(([x, y]) => (
        <G key={x}>
          <Ellipse cx={x} cy={y} rx={3} ry={2} fill="#3B2314" />
          <Line x1={x! - 2} y1={y} x2={x! + 2} y2={y} stroke="#8B5A3C" strokeWidth={0.8} />
        </G>
      ))}
    </G>
  ),
  old_fashioned: (
    <G>
      <Path d="M14 26 L50 26 L48 56 L16 56 Z" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M15 34 L49 34 L48 55 L16 55 Z" fill="#E8590C" opacity={0.85} />
      <Rect x={22} y={32} width={16} height={16} rx={3} fill="rgba(255,255,255,0.45)" stroke="rgba(255,255,255,0.8)" strokeWidth={1} />
      <Path d="M36 22 q10 -6 14 4 q-8 -2 -14 -4 Z" fill="#FD7E14" />
      <Circle cx={44} cy={42} r={4} fill="#C92A2A" />
      <Path d="M44 38 q2 -8 8 -10" fill="none" stroke="#2B8A3E" strokeWidth={1.4} />
      <Line x1={16} y1={52} x2={48} y2={52} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
    </G>
  ),
  french_75: (
    <G>
      <Path d="M26 8 L38 8 L36 38 Q32 42 28 38 Z" fill="#FFEC99" />
      <Path d="M26 8 L38 8 L36 38 Q32 42 28 38 Z" fill="none" stroke={GLASS} strokeWidth={2} strokeLinejoin="round" />
      {[
        [30, 30],
        [33, 24],
        [31, 18],
        [34, 14],
      ].map(([x, y]) => (
        <Circle key={`${x}${y}`} cx={x} cy={y} r={1.1} fill="#FFFFFF" />
      ))}
      <Line x1={32} y1={40} x2={32} y2={54} stroke={GLASS} strokeWidth={2} />
      <Path d="M24 56 Q32 52 40 56" fill="none" stroke={GLASS} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M38 6 q8 0 6 8 q-2 3 -5 1" fill="none" stroke="#FAB005" strokeWidth={2.6} strokeLinecap="round" />
    </G>
  ),
  champagne_tower: (
    <G>
      {[
        [32, 8],
        [23, 24],
        [41, 24],
        [14, 40],
        [32, 40],
        [50, 40],
      ].map(([x, y]) => (
        <G key={`${x}-${y}`}>
          <Path d={`M${x! - 8} ${y} Q${x} ${y! + 8} ${x! + 8} ${y} Z`} fill="#FFD43B" />
          <Path d={`M${x! - 8} ${y} Q${x} ${y! + 8} ${x! + 8} ${y}`} fill="none" stroke={GLASS} strokeWidth={1.6} />
          <Line x1={x} y1={y! + 4} x2={x} y2={y! + 12} stroke={GLASS} strokeWidth={1.4} />
          <Line x1={x! - 4} y1={y! + 12} x2={x! + 4} y2={y! + 12} stroke={GLASS} strokeWidth={1.6} strokeLinecap="round" />
        </G>
      ))}
      {[
        [20, 6],
        [44, 4],
        [10, 22],
        [54, 20],
      ].map(([x, y]) => (
        <Path key={`${x}${y}`} d={`M${x} ${y! - 3} L${x! + 1} ${y! - 1} L${x! + 3} ${y} L${x! + 1} ${y! + 1} L${x} ${y! + 3} L${x! - 1} ${y! + 1} L${x! - 3} ${y} L${x! - 1} ${y! - 1} Z`} fill="#FFF3BF" />
      ))}
    </G>
  ),
};
