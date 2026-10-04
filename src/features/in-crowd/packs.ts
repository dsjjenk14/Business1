/**
 * What's for sale in The In Crowd. These are consumable in-app purchases:
 * the product ids must match the App Store / Google Play products and the
 * RevenueCat project exactly (see docs/IN-CROWD-PURCHASES.md).
 */
export type PackId = 'passes_3' | 'passes_8' | 'passes_20' | 'coins_1500' | 'coins_5000' | 'coins_15000';

export type Pack = {
  id: PackId;
  /** Store product id. */
  product: string;
  kind: 'passes' | 'coins';
  amount: number;
  name: string;
  /** Shown until the store tells us the real, local price. */
  fallbackPrice: string;
  badge?: string;
};

export const PACKS: Pack[] = [
  { id: 'passes_3', product: 'incrowd_passes_3', kind: 'passes', amount: 3, name: '3 VIP Passes', fallbackPrice: '$0.99' },
  { id: 'passes_8', product: 'incrowd_passes_8', kind: 'passes', amount: 8, name: '8 VIP Passes', fallbackPrice: '$1.99', badge: 'Most popular' },
  { id: 'passes_20', product: 'incrowd_passes_20', kind: 'passes', amount: 20, name: '20 VIP Passes', fallbackPrice: '$3.99', badge: 'Best value' },
  { id: 'coins_1500', product: 'incrowd_coins_1500', kind: 'coins', amount: 1500, name: 'Pouch of coins', fallbackPrice: '$0.99' },
  { id: 'coins_5000', product: 'incrowd_coins_5000', kind: 'coins', amount: 5000, name: 'Bag of coins', fallbackPrice: '$2.99', badge: 'Most popular' },
  { id: 'coins_15000', product: 'incrowd_coins_15000', kind: 'coins', amount: 15000, name: 'Vault of coins', fallbackPrice: '$6.99', badge: 'Best value' },
];

export const PACKS_BY_ID: Record<PackId, Pack> = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<PackId, Pack>;

/** A VIP Pass bought with game coins, so nobody is ever stuck. */
export const PASS_COIN_PRICE = 300;

export type BuyResult = { ok: true; transactionId: string; test?: boolean } | { ok: false; cancelled?: boolean; message: string };
