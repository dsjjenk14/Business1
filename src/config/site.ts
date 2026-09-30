/**
 * Everything Dominique may want to change lives here.
 * Prices are in cents. Change them here and every screen follows.
 * (Stripe prices are created from these values in Phase 4.)
 */
export const PRICES = {
  basic: { cents: 1500, name: "The Blueprint" },
  premium: { cents: 49700, name: "Blueprint + 90 Days With Me" },
} as const;

export type Tier = keyof typeof PRICES;

export function priceLabel(tier: Tier): string {
  const c = PRICES[tier].cents;
  return "$" + (c % 100 === 0 ? (c / 100).toLocaleString("en-US") : (c / 100).toFixed(2));
}

/** Calendly link for premium kickoff calls. Empty = "Message me to schedule". */
export const BOOK_LINK = process.env.NEXT_PUBLIC_BOOK_LINK ?? "";

export const CONTACT = {
  name: "Dominique Jenkins",
  email: "dsjjenk@gmail.com",
  linkedin: "https://www.linkedin.com/in/Dominique-Jenkins-1",
  site: "https://hiredominique.com",
};

/** Beta preview: only these steps are open. Everything else shows the join card. */
export const BETA_OPEN_ACTS = ["Act 1 · Decide"];

/** Ad slots. Slot 1 = dashboard, slot 2 = Application Strategy. Phase 5 moves these to the admin panel. */
export const ADS: Record<1 | 2, { headline: string; text: string; cta: string; url: string } | null> = {
  1: null,
  2: null,
};
