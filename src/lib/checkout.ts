import type { Tier } from "@/config/site";

/**
 * Phase 2 placeholder, same behavior as the prototype when no payment link is set.
 * Phase 4 replaces this with a call that starts Stripe Checkout on the server.
 */
export function buy(tier: Tier, toast: (m: string) => void) {
  toast("Checkout link not set yet. Paste your " + (tier === "premium" ? "premium " : "") + "payment link at the top of the file. To preview now, use the free look or an access code.");
}
