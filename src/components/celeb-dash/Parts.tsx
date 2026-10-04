import { memo, type ReactNode } from 'react';
import { Platform, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { NICHES } from '@/features/celeb-dash/engine/content';
import type { Dish, Niche, RequestKind } from '@/features/celeb-dash/engine/types';

import { GameIcon, type IconName } from './Icons';
import { FONT, UI } from './palette';

/** Game text: Bebas for big numbers, Figtree for everything else. */
export function GText({
  children,
  font = 'semi',
  size = 14,
  color = UI.text,
  align,
  style,
  lines,
}: {
  children: ReactNode;
  font?: keyof typeof FONT;
  size?: number;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  lines?: number;
}) {
  return (
    <Text
      numberOfLines={lines}
      allowFontScaling={false}
      style={[{ fontFamily: FONT[font], fontSize: size, color, textAlign: align, lineHeight: font === 'display' ? size * 1.02 : size * 1.28 }, style]}>
      {children}
    </Text>
  );
}

/** A soft text glow/shadow that works on phones and on the web. */
export function textGlow(color: string, radius: number, dy = 0): TextStyle {
  if (Platform.OS === 'web') return { textShadow: `0px ${dy}px ${radius}px ${color}` } as TextStyle;
  return { textShadowColor: color, textShadowRadius: radius, textShadowOffset: { width: 0, height: dy } };
}

const HEART = 'M12 20.5S3.5 15.4 3.5 9.3A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.3c0 6.1-8.5 11.2-8.5 11.2z';
const HALF = 'M12 20.5S3.5 15.4 3.5 9.3A4.4 4.4 0 0 1 12 7z';

/** Patience as five hearts, in half steps. */
export const Hearts = memo(function Hearts({ value, size = 9, danger = false }: { value: number; size?: number; danger?: boolean }) {
  const full = danger ? '#FF2E4D' : '#FF4D6D';
  return (
    <Svg width={size * 5 + 4} height={size} viewBox={`0 0 ${24 * 5 + 10} 24`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = value - i;
        return (
          <G key={i} transform={`translate(${i * 26} 0)`}>
            <Path d={HEART} fill="rgba(20,10,30,0.55)" stroke="rgba(255,255,255,0.7)" strokeWidth={1.6} />
            {fill >= 1 ? <Path d={HEART} fill={full} stroke="#FFFFFF" strokeWidth={1.6} /> : fill >= 0.5 ? <Path d={HALF} fill={full} /> : null}
          </G>
        );
      })}
    </Svg>
  );
});

/**
 * Patience on the board: five segments (one per heart) so neighbors at a
 * table don't overlap. Green, amber, then red and blinking.
 */
export const PatienceMeter = memo(function PatienceMeter({ value, blink = false }: { value: number; blink?: boolean }) {
  const color = value >= 3.5 ? UI.green : value >= 1.6 ? UI.gold : UI.red;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1.5, padding: 1.5, borderRadius: 4, backgroundColor: 'rgba(14,11,20,0.78)', opacity: blink ? 0.45 : 1 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <View key={i} style={{ width: 5.2, height: 5, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
            <View style={{ width: `${fill * 100}%`, height: 5, backgroundColor: color }} />
          </View>
        );
      })}
    </View>
  );
});

const REQUEST_ICON: Record<RequestKind, IconName> = {
  drink: 'drink',
  charger: 'charger',
  glam: 'glam',
  light: 'light',
  contract: 'contract',
  selfie: 'selfie',
  order: 'order',
  food: 'avotoast',
  plate: 'plate',
};

export function requestIcon(kind: RequestKind, dish?: Dish): IconName {
  return kind === 'food' && dish ? dish : REQUEST_ICON[kind];
}

/** A guest's request: an icon in a speech bubble whose rim goes green → amber → red. */
export const Bubble = memo(function Bubble({ kind, dish, level, size = 34 }: { kind: RequestKind; dish?: Dish; level: 0 | 1 | 2; size?: number }) {
  const rim = level === 2 ? UI.red : level === 1 ? UI.gold : UI.green;
  return (
    <View style={{ width: size, height: size + 6, alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2.6,
          backgroundColor: '#FFFFFF',
          borderWidth: 2.5,
          borderColor: rim,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}>
        <GameIcon name={requestIcon(kind, dish)} size={size - 10} />
        {kind === 'food' ? (
          <View style={{ position: 'absolute', right: -6, top: -6, width: 15, height: 15, borderRadius: 8, backgroundColor: UI.panel2, alignItems: 'center', justifyContent: 'center' }}>
            <GameIcon name="clock" size={11} />
          </View>
        ) : null}
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: rim }} />
    </View>
  );
});

/** Same speech bubble, any icon (late guests, the router). */
export const IconBubble = memo(function IconBubble({ icon, rim = UI.gold, size = 28 }: { icon: IconName; rim?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size + 5, alignItems: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: rim, alignItems: 'center', justifyContent: 'center' }}>
        <GameIcon name={icon} size={size - 9} />
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: rim }} />
    </View>
  );
});

export function Stars({ count, size = 18, of = 3, gap = 2 }: { count: number; size?: number; of?: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: of }, (_, i) => (
        <GameIcon key={i} name={i < count ? 'star' : 'starEmpty'} size={size} />
      ))}
    </View>
  );
}

export function NicheChip({ niche, sign, small }: { niche: Niche; sign?: '+' | '−'; small?: boolean }) {
  const n = NICHES[niche];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: small ? 5 : 7,
        paddingVertical: small ? 1 : 2,
        borderRadius: 99,
        backgroundColor: sign === '−' ? 'rgba(255,92,122,0.16)' : `${n.color}26`,
        borderWidth: 1,
        borderColor: sign === '−' ? UI.red : n.color,
      }}>
      {sign ? (
        <GText font="black" size={small ? 10 : 11} color={sign === '−' ? UI.red : n.color}>
          {sign}
        </GText>
      ) : null}
      <GText font="bold" size={small ? 9.5 : 11} color={sign === '−' ? UI.red : n.color}>
        {n.label}
      </GText>
    </View>
  );
}

export function Pill({ children, color = UI.panel2, border = UI.line, style }: { children: ReactNode; color?: string; border?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: color, borderWidth: 1, borderColor: border }, style]}>
      {children}
    </View>
  );
}

export function GameButton({
  label,
  onPress,
  icon,
  tone = 'pink',
  size = 'md',
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: 'pink' | 'gold' | 'ghost' | 'cyan' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg = { pink: UI.pink, gold: UI.gold, ghost: 'transparent', cyan: UI.cyan, dark: UI.panel3 }[tone];
  const fg = tone === 'gold' || tone === 'cyan' ? '#1B1426' : UI.text;
  const edge = { pink: UI.pinkDeep, gold: UI.goldDeep, ghost: 'rgba(255,255,255,0.3)', cyan: '#2A8CB0', dark: '#1A1424' }[tone];
  const pad = size === 'lg' ? 16 : size === 'sm' ? 8 : 12;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: size === 'sm' ? 36 : 48,
          paddingHorizontal: pad + 6,
          paddingVertical: pad - 2,
          borderRadius: 16,
          backgroundColor: bg,
          borderWidth: tone === 'ghost' ? 1.5 : 0,
          borderColor: edge,
          borderBottomWidth: tone === 'ghost' ? 1.5 : 4,
          opacity: disabled ? 0.45 : 1,
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
        style,
      ]}>
      {icon ? <GameIcon name={icon} size={size === 'lg' ? 24 : 20} /> : null}
      <GText font="black" size={size === 'lg' ? 18 : size === 'sm' ? 13 : 15} color={fg}>
        {label}
      </GText>
    </Pressable>
  );
}

/** Rounded dark card used across the game's screens. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: UI.panel, borderRadius: 20, borderWidth: 1, borderColor: UI.line, padding: 16 }, style]}>{children}</View>;
}

/** A round icon button (pause, close, back). */
export function IconCircle({ icon, onPress, label, size = 42, color = 'rgba(14,11,20,0.72)' }: { icon: IconName; onPress: () => void; label: string; size?: number; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <GameIcon name={icon} size={size * 0.48} />
    </Pressable>
  );
}

export function ProgressBar({ value, color = UI.pink, height = 8, track = 'rgba(255,255,255,0.12)', style }: { value: number; color?: string; height?: number; track?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
