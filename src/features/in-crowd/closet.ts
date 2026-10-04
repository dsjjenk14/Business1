import { PLANNERS, type PlannerId } from './engine/content';
import type { BagKind, Look, PhoneFinish, WatchBand } from './engine/types';

/**
 * The Closet: what the planner carries and wears. Items are bought once
 * with coins and can be worn by either planner. Product names are generic
 * on purpose (no real brand names in the App Store build).
 */
export type Slot = 'phone' | 'watch' | 'bag' | 'shades' | 'earrings' | 'necklace' | 'headset';

export type ClosetItem = {
  id: string;
  slot: Slot;
  name: string;
  blurb: string;
  /** Coins; 0 means everyone owns it. */
  price: number;
  apply: (look: Look) => Look;
};

const phone = (finish: PhoneFinish) => (l: Look): Look => ({ ...l, gear: { ...l.gear, phone: finish } });
const watch = (band: WatchBand) => (l: Look): Look => ({ ...l, gear: { ...l.gear, watch: band } });
const bag = (kind: BagKind) => (l: Look): Look => ({ ...l, gear: { ...l.gear, bag: kind } });
const shades = (color: string) => (l: Look): Look => ({ ...l, acc: 'shades', accColor: color });

export const CLOSET: ClosetItem[] = [
  { id: 'phone-titanium', slot: 'phone', name: 'Pro Phone · Natural Titanium', blurb: 'Triple camera. Always at 100%.', price: 0, apply: phone('titanium') },
  { id: 'phone-midnight', slot: 'phone', name: 'Pro Phone · Midnight', blurb: 'Matte black, very serious.', price: 250, apply: phone('midnight') },
  { id: 'phone-pink', slot: 'phone', name: 'Pro Phone · Blush', blurb: 'Matches every lip gloss.', price: 400, apply: phone('pink') },
  { id: 'phone-gold', slot: 'phone', name: 'Pro Phone · Desert Gold', blurb: 'Goes with the hoops.', price: 700, apply: phone('gold') },
  { id: 'watch-midnight', slot: 'watch', name: 'Smartwatch · Midnight Sport', blurb: 'Counts every step between tables.', price: 450, apply: watch('midnight') },
  { id: 'watch-starlight', slot: 'watch', name: 'Smartwatch · Starlight', blurb: 'Soft white band, loud notifications.', price: 450, apply: watch('starlight') },
  { id: 'watch-pink', slot: 'watch', name: 'Smartwatch · Blush Loop', blurb: 'Pink band, pink rings, pink everything.', price: 600, apply: watch('pink') },
  { id: 'watch-gold', slot: 'watch', name: 'Smartwatch · Gold Link', blurb: 'The gold link band. Very red carpet.', price: 1100, apply: watch('gold') },
  { id: 'bag-mini', slot: 'bag', name: 'Mini Top-Handle · Blush', blurb: 'Fits a lip oil and nothing else.', price: 700, apply: bag('mini') },
  { id: 'bag-quilted', slot: 'bag', name: 'Quilted Chain Bag', blurb: 'Black quilted leather, gold chain strap.', price: 900, apply: bag('quilted') },
  { id: 'bag-monogram', slot: 'bag', name: 'Monogram Shoulder Bag', blurb: 'Classic print, holds the whole guest list.', price: 1200, apply: bag('monogram') },
  { id: 'bag-croc', slot: 'bag', name: 'Croc Top-Handle · Ivory', blurb: 'Embossed croc, gold turn-lock. The one.', price: 1500, apply: bag('croc') },
  { id: 'shades-noir', slot: 'shades', name: 'Cat-Eye Shades · Noir', blurb: 'For paparazzi nights.', price: 300, apply: shades('#141414') },
  { id: 'shades-tortoise', slot: 'shades', name: 'Cat-Eye Shades · Tortoise', blurb: 'Warm brown, very editorial.', price: 350, apply: shades('#7A4A2A') },
  { id: 'shades-rose', slot: 'shades', name: 'Cat-Eye Shades · Rose', blurb: 'Rose-tinted, literally.', price: 350, apply: shades('#E56B9A') },
  { id: 'earrings-hoops', slot: 'earrings', name: 'Gold Hoops', blurb: 'The essentials.', price: 0, apply: (l) => ({ ...l, earrings: 'hoops' }) },
  { id: 'earrings-studs', slot: 'earrings', name: 'Gold Studs', blurb: 'Small, bright, everyday.', price: 200, apply: (l) => ({ ...l, earrings: 'studs' }) },
  { id: 'earrings-drops', slot: 'earrings', name: 'Pearl Drops', blurb: 'Gold bar, pearl drop. Gala-ready.', price: 500, apply: (l) => ({ ...l, earrings: 'drops' }) },
  { id: 'necklace-layered', slot: 'necklace', name: 'Layered Gold Chains', blurb: 'Two chains and a tiny charm.', price: 0, apply: (l) => ({ ...l, necklace: 'layered' }) },
  { id: 'necklace-chain', slot: 'necklace', name: 'Fine Gold Chain', blurb: 'One chain, one charm.', price: 150, apply: (l) => ({ ...l, necklace: 'chain' }) },
  { id: 'necklace-pendant', slot: 'necklace', name: 'Ruby Pendant', blurb: 'A red stone on a gold chain.', price: 400, apply: (l) => ({ ...l, necklace: 'pendant' }) },
  { id: 'headset', slot: 'headset', name: 'Planner Headset', blurb: 'Earpiece and mic. Very in charge.', price: 0, apply: (l) => ({ ...l, gear: { ...l.gear, headset: true } }) },
];

export const CLOSET_BY_ID: Record<string, ClosetItem> = Object.fromEntries(CLOSET.map((i) => [i.id, i]));

export const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'phone', label: 'Phones' },
  { slot: 'watch', label: 'Watches' },
  { slot: 'bag', label: 'Bags' },
  { slot: 'shades', label: 'Shades' },
  { slot: 'earrings', label: 'Earrings' },
  { slot: 'necklace', label: 'Necklaces' },
  { slot: 'headset', label: 'Headset' },
];

export type Equipped = Partial<Record<Slot, string>>;

/** What each planner wears before you change anything. */
export const DEFAULT_EQUIPPED: Record<PlannerId, Equipped> = {
  zara: { phone: 'phone-titanium', earrings: 'earrings-hoops', necklace: 'necklace-layered' },
  kiki: { headset: 'headset', phone: 'phone-titanium' },
};

export const FREE_ITEMS = CLOSET.filter((i) => i.price === 0).map((i) => i.id);

/** The planner's look with their Closet picks applied. */
export function dressedLook(planner: PlannerId, equipped: Equipped): Look {
  const base = PLANNERS[planner].look;
  let look: Look = { ...base, acc: 'none', gear: {}, earrings: undefined, necklace: undefined };
  for (const id of Object.values(equipped)) {
    const item = id ? CLOSET_BY_ID[id] : undefined;
    if (item) look = item.apply(look);
  }
  return look;
}
