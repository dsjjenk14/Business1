/**
 * Design tokens: the single contract every theme fills in.
 *
 * Screens and components must only read colors, fonts, spacing, radius and
 * shadows from here (via `useTheme()`), never hardcode them. That is what lets
 * the whole look change in one place.
 */

import type { FONT_MAP } from './fonts';

/** Only fonts that are actually loaded can be used (checked at compile time). */
export type FontName = keyof typeof FONT_MAP;

export type ThemeId = 'L' | 'N' | 'O' | 'A' | 'B' | 'C' | 'D';

export type ThemeColors = {
  /** Screen background. */
  bg: string;
  /** Cards and sheets. */
  surface: string;
  /** Inputs, chips, nested cards. */
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  /** The one accent that does the heavy lifting on a screen. */
  primary: string;
  /** The primary color when used for text (links, labels): always readable on bg, surface and surfaceAlt. */
  primaryText: string;
  onPrimary: string;
  /** Secondary accent, used sparingly (section bars, highlights). */
  secondary: string;
  onSecondary: string;
  /** Vouches, verification, trust signals. */
  trust: string;
  onTrust: string;
  /** Reserved for AI features, always paired with the ✦ marker. */
  ai: string;
  onAi: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  /** Sponsored / Featured labels. Must stay clearly visible. */
  sponsored: string;
  onSponsored: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  overlay: string;
};

export type ThemeFonts = {
  display: FontName;
  displayBold: FontName;
  body: FontName;
  bodyMedium: FontName;
  bodyBold: FontName;
  mono: FontName;
};

export type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

export type ThemeType = {
  hero: TypeStyle;
  h1: TypeStyle;
  h2: TypeStyle;
  h3: TypeStyle;
  body: TypeStyle;
  small: TypeStyle;
  caption: TypeStyle;
  label: TypeStyle;
  number: TypeStyle;
};

export type Theme = {
  id: ThemeId;
  name: string;
  tagline: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
  fonts: ThemeFonts;
  type: ThemeType;
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
  /** Spacing scale in points. Use space[n] instead of magic numbers. */
  space: readonly [0, 4, 8, 12, 16, 20, 24, 32, 40, 56];
  borderWidth: { hairline: number; regular: number; strong: number };
  /** CSS-style box-shadow strings (supported natively in React Native 0.76+). */
  shadow: { card: string; raised: string; pressed: string };
  /** Personality switches that change component shape, not just color. */
  style: {
    /** How section boxes look. poster = big condensed title with a rule, open content. */
    section: 'plain' | 'glass' | 'ledger' | 'poster';
    /** boxed = bordered cards; flat = filled surfaces with no outline, accents as a side bar. */
    surface?: 'boxed' | 'flat';
    /** soft = rounded controls; ticket = square-cut, stamped controls (poster buttons, tag chips, underline tabs). */
    controls?: 'soft' | 'ticket';
    /** How badges and tier chips look. */
    badge: 'pill' | 'credential';
    /** Uppercase small labels ("GOING OUT TONIGHT"). */
    uppercaseLabels: boolean;
    /** Use the mono font for counts and scores. */
    monoNumbers: boolean;
    /** Small labels in the mono face, like a ticket stamp. */
    monoLabels?: boolean;
  };
};

export const SPACE = [0, 4, 8, 12, 16, 20, 24, 32, 40, 56] as const;

/** Upper bound for Dynamic Type scaling so layouts stay intact at the largest sizes. */
export const MAX_FONT_SCALE = 1.6;
