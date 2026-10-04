import type { VenueId } from '@/features/in-crowd/engine/types';
import type { FontName } from '@/theme/tokens';

/**
 * The In Crowd has its own art direction (a night out in Clout City), so its
 * colors live here instead of in the app themes. Every screen of the game
 * reads from this file.
 */
export const UI = {
  bg: '#0E0B14',
  bgDeep: '#07050B',
  panel: '#1A1424',
  panel2: '#251C33',
  panel3: '#33264A',
  line: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  muted: '#C9BEDD',
  subtle: '#8F84A6',
  pink: '#FF4D8D',
  pinkDeep: '#C71F63',
  gold: '#FFD166',
  goldDeep: '#C99A2E',
  cyan: '#4CC9F0',
  green: '#7CF29C',
  red: '#FF5C7A',
  live: '#FF2E4D',
  shadow: 'rgba(0,0,0,0.45)',
} as const;

export const FONT: Record<'display' | 'black' | 'bold' | 'semi' | 'body', FontName> = {
  display: 'BebasNeue_400Regular',
  black: 'Figtree_900Black',
  bold: 'Figtree_800ExtraBold',
  semi: 'Figtree_600SemiBold',
  body: 'Figtree_400Regular',
};

export type VenuePalette = {
  name: string;
  wallTop: string;
  wallBottom: string;
  floorA: string;
  floorB: string;
  counter: string;
  counterTop: string;
  cloth: string;
  clothShade: string;
  clothAccent: string;
  chair: string;
  accent: string;
  label: string;
  labelText: string;
};

export const VENUES: Record<VenueId, VenuePalette> = {
  rooftop: {
    name: 'Rooftop',
    wallTop: '#FF8A7A',
    wallBottom: '#FFC371',
    floorA: '#B98657',
    floorB: '#A47448',
    counter: '#3B2A2C',
    counterTop: '#5A4144',
    cloth: '#FFF4EA',
    clothShade: '#F1DCCB',
    clothAccent: '#FF6F91',
    chair: '#E8B04B',
    accent: '#FF6F91',
    label: '#2B1E20',
    labelText: '#FFE3D3',
  },
  villa: {
    name: 'Villa',
    wallTop: '#FBF6EC',
    wallBottom: '#EFE4D2',
    floorA: '#E9DCC7',
    floorB: '#DDCDB5',
    counter: '#178F86',
    counterTop: '#2EC4B6',
    cloth: '#FFFFFF',
    clothShade: '#E6F4F3',
    clothAccent: '#00BBF9',
    chair: '#F15BB5',
    accent: '#00BBF9',
    label: '#0D5C56',
    labelText: '#E6FFFB',
  },
  studio: {
    name: 'Studio',
    wallTop: '#1B1035',
    wallBottom: '#120A26',
    floorA: '#160D2B',
    floorB: '#1E1338',
    counter: '#0B0718',
    counterTop: '#2A1B4D',
    cloth: '#2C1D52',
    clothShade: '#20153D',
    clothAccent: '#FF2E88',
    chair: '#00E0FF',
    accent: '#FF2E88',
    label: '#FF2E88',
    labelText: '#FFFFFF',
  },
  festival: {
    name: 'Festival',
    wallTop: '#0B1026',
    wallBottom: '#1B1F47',
    floorA: '#2F5D3A',
    floorB: '#2A5534',
    counter: '#4A3423',
    counterTop: '#6F4E33',
    cloth: '#F4E3C1',
    clothShade: '#E2CBA0',
    clothAccent: '#F4A261',
    chair: '#E76F51',
    accent: '#F4A261',
    label: '#2B1D14',
    labelText: '#FFE8C2',
  },
  gala: {
    name: 'Gala',
    wallTop: '#1B160B',
    wallBottom: '#0F0C06',
    floorA: '#101013',
    floorB: '#17171B',
    counter: '#0A0A0C',
    counterTop: '#2A2414',
    cloth: '#FBF5E6',
    clothShade: '#EDE2C6',
    clothAccent: '#C9A227',
    chair: '#9B111E',
    accent: '#C9A227',
    label: '#C9A227',
    labelText: '#1B160B',
  },
};
