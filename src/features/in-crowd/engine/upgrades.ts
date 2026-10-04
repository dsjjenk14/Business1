import type { UpgradeId, Upgrades } from './types';

/** The shop. Coins come from clout at the end of every night. */
export const UPGRADES: Record<UpgradeId, { name: string; blurb: string; icon: string; tiers: { price: number; effect: string }[] }> = {
  sneakers: {
    name: 'Designer Sneakers',
    blurb: 'Kiki walks faster.',
    icon: 'sneaker',
    tiers: [
      { price: 150, effect: '+12% speed' },
      { price: 420, effect: '+24% speed' },
      { price: 900, effect: '+36% speed' },
    ],
  },
  tote: {
    name: 'Mega Tote',
    blurb: 'Carry more at once.',
    icon: 'tote',
    tiers: [
      { price: 350, effect: 'Carry 3 things' },
      { price: 1000, effect: 'Carry 4 things' },
    ],
  },
  dj: {
    name: 'Resident DJ',
    blurb: 'Good music keeps guests patient.',
    icon: 'dj',
    tiers: [
      { price: 250, effect: 'Patience lasts 10% longer' },
      { price: 700, effect: 'Patience lasts 20% longer' },
    ],
  },
  chef: {
    name: 'Private Chef',
    blurb: 'Food comes out faster.',
    icon: 'chef',
    tiers: [
      { price: 220, effect: 'Cooks 25% faster' },
      { price: 650, effect: 'Cooks 50% faster' },
    ],
  },
  bodyguard: {
    name: 'Bodyguard',
    blurb: 'Handles paparazzi and trolls for you.',
    icon: 'guard',
    tiers: [
      { price: 380, effect: 'Steps in after 6 seconds' },
      { price: 850, effect: 'Steps in after 3 seconds' },
    ],
  },
  glamsquad: {
    name: 'Glam Squad',
    blurb: 'Guests arrive happier.',
    icon: 'glamsquad',
    tiers: [
      { price: 300, effect: '+½ heart for everyone at the start' },
      { price: 780, effect: '+1 heart for everyone at the start' },
    ],
  },
  powerbank: {
    name: 'Gold Power Banks',
    blurb: 'Every request you fill makes guests even happier.',
    icon: 'powerbank',
    tiers: [
      { price: 260, effect: '+¼ heart per request' },
      { price: 680, effect: '+½ heart per request' },
    ],
  },
  mesh: {
    name: 'Mesh Wi-Fi',
    blurb: 'Outages hurt less.',
    icon: 'mesh',
    tiers: [
      { price: 200, effect: 'Outages drain half as much' },
      { price: 520, effect: 'Router reboots itself after 6 seconds' },
    ],
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['sneakers', 'tote', 'dj', 'chef', 'bodyguard', 'glamsquad', 'powerbank', 'mesh'];

export const NO_UPGRADES: Upgrades = { sneakers: 0, tote: 0, dj: 0, chef: 0, bodyguard: 0, glamsquad: 0, powerbank: 0, mesh: 0 };

export type Effects = {
  speed: number;
  cap: number;
  decay: number;
  cook: number;
  guard: number;
  startMood: number;
  serveBonus: number;
  wifiDrain: number;
  wifiAuto: number;
};

export function effects(u: Upgrades): Effects {
  return {
    speed: 1 + 0.12 * u.sneakers,
    cap: 2 + u.tote,
    decay: 1 - 0.1 * u.dj,
    cook: 1 - 0.25 * u.chef,
    guard: u.bodyguard >= 2 ? 3 : u.bodyguard === 1 ? 6 : Infinity,
    startMood: 0.5 * u.glamsquad,
    serveBonus: 0.25 * u.powerbank,
    wifiDrain: u.mesh >= 1 ? 0.25 : 0.5,
    wifiAuto: u.mesh >= 2 ? 6 : Infinity,
  };
}
