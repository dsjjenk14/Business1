import type { BuyResult, PackId } from './packs';

/**
 * Web version: the App Store and Google Play only exist on phones, so packs
 * are bought in the app. Development builds use test purchases so the
 * whole flow can still be tried in a browser.
 * (The phone version is purchases.native.ts.)
 */
export function purchasesState(): 'live' | 'test' | 'off' {
  return __DEV__ ? 'test' : 'off';
}

export async function loadPrices(): Promise<Partial<Record<PackId, string>>> {
  return {};
}

export async function buyPack(id: PackId): Promise<BuyResult> {
  if (!__DEV__) return { ok: false, message: 'Packs are bought in the I’m In app on your phone.' };
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true, transactionId: `test-${id}-${Date.now()}`, test: true };
}
