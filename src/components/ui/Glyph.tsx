import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme, type Theme } from '@/theme';

import { AppText } from './AppText';

/**
 * I'm In's own symbol set. The app never uses emoji: every icon for a
 * category, vibe, event, group or venue is one of these, drawn on a 24×24
 * grid with the same rounded line weight so they read as one family.
 *
 * Shapes: `p` is a stroked path, `c` a stroked circle, `d` a filled dot.
 */
type Shape = { p: string } | { c: [number, number, number] } | { d: [number, number, number] };

const GLYPHS = {
  // Places and time
  pin: [{ p: 'M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z' }, { c: [12, 9.8, 2.3] }],
  calendar: [{ p: 'M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z' }, { p: 'M4.5 10.5h15' }, { p: 'M8.5 3.5v4' }, { p: 'M15.5 3.5v4' }, { d: [12, 15, 1.3] }],
  moon: [{ p: 'M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z' }],
  globe: [{ c: [12, 12, 8.5] }, { p: 'M3.5 12h17' }, { p: 'M12 3.5c3 2.8 3 14.2 0 17' }, { p: 'M12 3.5c-3 2.8-3 14.2 0 17' }],
  route: [{ p: 'M6.5 18.5c0-3.8 11-2.6 11-7s-8-3.7-8-7' }, { d: [6.5, 19, 1.8] }, { d: [9.5, 4.5, 1.8] }],

  // Pins
  thought: [{ p: 'M5.5 5h13a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5v-3.5h-1A1.5 1.5 0 0 1 4 15V6.5A1.5 1.5 0 0 1 5.5 5z' }],
  question: [{ c: [12, 12, 8.5] }, { p: 'M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4' }, { d: [12, 16.6, 1.1] }],
  camera: [{ p: 'M4 8.5a1.5 1.5 0 0 1 1.5-1.5H8l1.6-2.5h4.8L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z' }, { c: [12, 13, 3.3] }],
  party: [{ p: 'M4.5 19.5l3.8-10.8 7 7z' }, { p: 'M13.5 4.5v2' }, { p: 'M19.5 10.5h-2' }, { p: 'M17 7l1.6-1.6' }, { d: [10.5, 4.5, 1] }, { d: [19.5, 14, 1] }],
  flame: [{ p: 'M12 20.5c-3.9 0-6.5-2.5-6.5-6 0-2.8 1.8-4.6 3.2-6 .4 1.8 1.3 2.8 2.3 3.2 0-3.6 1.4-6 3.6-7.7.5 2.8 4.4 5 4.4 10.5 0 3.5-2.8 6-7 6z' }],
  chat: [{ p: 'M4.5 6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v8.5A1.5 1.5 0 0 1 18 16h-8.5L5 19.5V16.2A1.5 1.5 0 0 1 4.5 14.8z' }, { d: [9, 10.3, 1] }, { d: [12, 10.3, 1] }, { d: [15, 10.3, 1] }],

  // Food, drink, music
  dinner: [{ c: [14, 12, 6.3] }, { c: [14, 12, 3.2] }, { p: 'M4.5 3.5v17' }, { p: 'M3 3.5V7a1.5 1.5 0 0 0 3 0V3.5' }],
  drinks: [{ p: 'M4.5 4.5h15L12 13z' }, { p: 'M12 13v6.5' }, { p: 'M8.5 19.5h7' }, { p: 'M7.5 8h9' }],
  wine: [{ p: 'M8 3.5h8l-.4 4.8a3.6 3.6 0 0 1-7.2 0z' }, { p: 'M12 12v7.5' }, { p: 'M8.5 19.5h7' }],
  coffee: [{ p: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z' }, { p: 'M16 10.5h1.2a2.3 2.3 0 0 1 0 4.6H16' }, { p: 'M9 3.5v2.5' }, { p: 'M12.5 3.5v2.5' }],
  brunch: [{ p: 'M12 4.5c3.2 0 4.4 2.1 6 3.2 1.9 1.4 2.1 4.8.3 6.8-1.6 1.8-3.4 5-7.6 5-3.9 0-6.7-2.3-6.7-5.5 0-2.7 1.3-4 2.3-5.5 1.3-1.9 2.9-4 5.7-4z' }, { c: [11.5, 12.2, 2.6] }],
  music: [{ p: 'M9 17.5V5.5l10-2v12' }, { c: [6.5, 17.5, 2.5] }, { c: [16.5, 15.5, 2.5] }],

  // Activity
  fitness: [{ p: 'M3.5 10v4' }, { p: 'M6.5 7v10' }, { p: 'M17.5 7v10' }, { p: 'M20.5 10v4' }, { p: 'M6.5 12h11' }],
  outdoors: [{ p: 'M5 19C5 10.5 10.7 5.2 19.5 4.5 18.8 13.3 13.5 19 5 19z' }, { p: 'M5 19l8.5-8.5' }],
  paddle: [{ p: 'M10.2 13.8a5.6 5.6 0 1 1 7.9-7.9 5.6 5.6 0 0 1-7.9 7.9z' }, { p: 'M10.2 13.8L4.5 19.5' }, { d: [6, 6, 1.6] }],
  art: [{ p: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-.9 1.9-1.8 0-1-.9-1.4-.9-2.4 0-.9.8-1.5 1.9-1.5h1.8a3.8 3.8 0 0 0 3.8-3.8c0-4.2-3.8-7.5-8.5-7.5z' }, { d: [7.8, 11, 1.2] }, { d: [10, 7.3, 1.2] }, { d: [14.6, 7.3, 1.2] }],

  // Groups
  cap: [{ p: 'M2.5 9L12 4.5 21.5 9 12 13.5z' }, { p: 'M6.5 11v4.8c0 1.4 2.5 2.9 5.5 2.9s5.5-1.5 5.5-2.9V11' }, { p: 'M21.5 9v4.5' }],
  briefcase: [{ p: 'M4.5 8h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z' }, { p: 'M9 8V5.5h6V8' }, { p: 'M3.5 13h17' }],
  book: [{ p: 'M5 5.5A2 2 0 0 1 7 3.5h12v14H7a2 2 0 0 0-2 2z' }, { p: 'M5 19.5a2 2 0 0 0 2 2h12v-4' }],
  spark: [{ p: 'M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6-5.6-1.9 5.6-1.9z' }, { d: [18.5, 17.5, 1.3] }],

  // People and trust
  person: [{ c: [12, 8.5, 3.5] }, { p: 'M5 20a7 7 0 0 1 14 0' }],
  people: [{ c: [9, 8.5, 3] }, { p: 'M3.5 19.5a5.5 5.5 0 0 1 11 0' }, { c: [17, 9.5, 2.3] }, { p: 'M15.8 14.3a4.6 4.6 0 0 1 5.2 5.2' }],
  connect: [{ c: [9, 12, 5] }, { c: [15, 12, 5] }],
  link: [{ p: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }, { p: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }],
  medal: [{ c: [12, 15, 5] }, { p: 'M8.6 11.3L6 3.5h4l2 4 2-4h4l-2.6 7.8' }, { p: 'M10 15l1.4 1.4 2.6-2.6' }],
  seed: [{ c: [12, 12, 7.5] }, { d: [12, 12, 2.6] }],
  loop: [{ p: 'M4.5 12a7.5 7.5 0 0 1 13-5.1' }, { p: 'M18 3.5v4h-4' }, { p: 'M19.5 12a7.5 7.5 0 0 1-13 5.1' }, { p: 'M6 20.5v-4h4' }],
  bolt: [{ p: 'M13 3.5L5.5 13h6l-1 7.5 7.5-9.5h-6z' }],
  crown: [{ p: 'M3.5 8.5l4.3 3.8L12 5.5l4.2 6.8 4.3-3.8-2 10h-13z' }],

  // Status and actions
  check: [{ p: 'M5 12.5l4.5 4.5L19 7.5' }],
  plus: [{ p: 'M12 5v14' }, { p: 'M5 12h14' }],
  star: [{ p: 'M12 3.8l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 17l-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z' }],
  lock: [{ p: 'M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z' }, { p: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }],
  key: [{ c: [8, 15, 4] }, { p: 'M11 12l8.5-8.5' }, { p: 'M16.5 6.5l2.5 2.5' }, { p: 'M14.5 8.5l1.8 1.8' }],
  mail: [{ p: 'M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z' }, { p: 'M3.5 7l8.5 6 8.5-6' }],
  coin: [{ c: [12, 12, 8.5] }, { p: 'M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5' }, { p: 'M12 6.5V8' }, { p: 'M12 16v1.5' }],
  warning: [{ p: 'M12 4.5l8.5 15h-17z' }, { p: 'M12 10v4' }, { d: [12, 16.8, 1.1] }],
  live: [{ d: [12, 12, 3] }, { p: 'M7.8 7.8a6 6 0 0 0 0 8.4' }, { p: 'M16.2 7.8a6 6 0 0 1 0 8.4' }, { p: 'M5 5a10 10 0 0 0 0 14' }, { p: 'M19 5a10 10 0 0 1 0 14' }],
  arrive: [{ p: 'M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z' }, { p: 'M9.3 9.8l1.9 1.9 3.6-3.6' }],
  heading: [{ p: 'M4.5 12h13' }, { p: 'M13 7l5 5-5 5' }, { d: [4.5, 12, 1.6] }],
  smile: [{ c: [12, 12, 8.5] }, { p: 'M8.5 14.2c1.8 2.2 5.2 2.2 7 0' }, { d: [9.3, 10, 1.1] }, { d: [14.7, 10, 1.1] }],
  heart: [{ p: 'M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z' }],
  shield: [{ p: 'M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z' }, { p: 'M9 12l2.2 2.2L15.5 10' }],
  phone: [{ p: 'M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z' }],
  siren: [{ p: 'M6.5 17.5v-5a5.5 5.5 0 0 1 11 0v5' }, { p: 'M4.5 17.5h15v2.5h-15z' }, { p: 'M12 3.5V5' }, { p: 'M4.2 6.2l1.1 1.1' }, { p: 'M19.8 6.2l-1.1 1.1' }],
  exit: [{ p: 'M10 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h4' }, { p: 'M14 8l4 4-4 4' }, { p: 'M18 12H9' }],
  clock: [{ c: [12, 12, 8.5] }, { p: 'M12 7.5V12l3 2' }],
} satisfies Record<string, Shape[]>;

export type GlyphName = keyof typeof GLYPHS;

export const isGlyphName = (v: unknown): v is GlyphName => typeof v === 'string' && v in GLYPHS;

type Tone = 'text' | 'muted' | 'subtle' | 'primary' | 'trust' | 'ai' | 'sponsored' | 'danger' | 'onPrimary';

function toneColor(t: Theme, tone: Tone) {
  switch (tone) {
    case 'muted':
      return t.colors.textMuted;
    case 'subtle':
      return t.colors.textSubtle;
    case 'onPrimary':
      return t.colors.onPrimary;
    case 'text':
      return t.colors.text;
    default:
      return t.colors[tone];
  }
}

/** One symbol. Unknown names (e.g. old data) fall back to `spark`. */
export function Glyph({
  name,
  size = 20,
  tone = 'text',
  color,
  strokeWidth = 1.8,
  label,
}: {
  name: GlyphName | string | null | undefined;
  size?: number;
  tone?: Tone;
  color?: string;
  strokeWidth?: number;
  /** Spoken by screen readers. Leave out when the text next to it already says it. */
  label?: string;
}) {
  const t = useTheme();
  const stroke = color ?? toneColor(t, tone);
  const shapes: Shape[] = GLYPHS[isGlyphName(name) ? name : 'spark'];
  const svg = (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((s, i) =>
        'p' in s ? (
          <Path key={i} d={s.p} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : 'c' in s ? (
          <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        ) : (
          <Circle key={i} cx={s.d[0]} cy={s.d[1]} r={s.d[2]} fill={stroke} />
        ),
      )}
    </Svg>
  );
  // Labeled symbols are announced; decorative ones are hidden from screen readers.
  return label ? (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      {svg}
    </View>
  ) : (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {svg}
    </View>
  );
}

/**
 * A symbol on a rounded tile: used where a picture would sit (event, group
 * and venue headers, list rows).
 */
export function GlyphTile({
  name,
  size = 44,
  tone = 'primary',
  style,
  label,
}: {
  name: GlyphName | string | null | undefined;
  size?: number;
  tone?: 'primary' | 'trust' | 'ai' | 'sponsored' | 'muted';
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const t = useTheme();
  const color = tone === 'muted' ? t.colors.textMuted : t.colors[tone];
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.colors.surfaceAlt,
          borderWidth: t.borderWidth.hairline,
          borderColor: t.colors.border,
        },
        style,
      ]}>
      <Glyph name={name} size={Math.round(size * 0.56)} color={color} label={label} />
    </View>
  );
}

/** A bold line of text with a symbol in front, e.g. card titles. */
export function GlyphTitle({
  glyph,
  children,
  tone = 'primary',
  variant = 'body',
}: {
  glyph: GlyphName;
  children: React.ReactNode;
  tone?: Tone;
  variant?: 'body' | 'h3' | 'small';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Glyph name={glyph} size={variant === 'h3' ? 22 : 18} tone={tone} strokeWidth={2} />
      <AppText weight="bold" variant={variant} style={{ flexShrink: 1 }}>
        {children}
      </AppText>
    </View>
  );
}
