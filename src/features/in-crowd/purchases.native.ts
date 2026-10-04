import { NativeModules, Platform } from 'react-native';
import type { PurchasesStoreProduct } from 'react-native-purchases';

import { PACKS, PACKS_BY_ID, type BuyResult, type PackId } from './packs';

/**
 * In-app purchases on iPhone and Android, through RevenueCat (which talks to
 * the App Store and Google Play and checks every receipt).
 *
 * Live only when the RevenueCat key for this platform is set
 * (EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) and
 * the app is a real build (Expo Go doesn't include the store module).
 * Development builds without a key use test purchases instead.
 *
 * The SDK is only loaded when the native store module is in the build, so
 * over-the-air updates to older builds (and Expo Go) never touch it.
 */
const KEY = Platform.select({ ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY });

let configured = false;
const products: Record<string, PurchasesStoreProduct> = {};

const hasNativeStore = () => !!NativeModules.RNPurchases;

type Sdk = (typeof import('react-native-purchases'))['default'];
function sdk(): Sdk | null {
  if (!hasNativeStore()) return null;
  // Loaded on demand on purpose (see above), so not a top-level import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('react-native-purchases') as typeof import('react-native-purchases')).default;
}

export function purchasesState(): 'live' | 'test' | 'off' {
  if (KEY && hasNativeStore()) return 'live';
  return __DEV__ ? 'test' : 'off';
}

function ensureConfigured(): boolean {
  if (configured) return true;
  const Purchases = sdk();
  if (!KEY || !Purchases) return false;
  try {
    Purchases.configure({ apiKey: KEY });
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

/** Local prices from the store ("$0.99", "0,99 €"), by pack. */
export async function loadPrices(): Promise<Partial<Record<PackId, string>>> {
  const Purchases = sdk();
  if (!ensureConfigured() || !Purchases) return {};
  try {
    const list = await Purchases.getProducts(
      PACKS.map((p) => p.product),
      Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    );
    for (const p of list) products[p.identifier] = p;
    return Object.fromEntries(PACKS.filter((p) => products[p.product]).map((p) => [p.id, products[p.product]?.priceString ?? p.fallbackPrice]));
  } catch {
    return {};
  }
}

export async function buyPack(id: PackId): Promise<BuyResult> {
  const pack = PACKS_BY_ID[id];
  const Purchases = sdk();
  if (!ensureConfigured() || !Purchases) {
    if (__DEV__) return { ok: true, transactionId: `test-${id}-${Date.now()}`, test: true };
    return { ok: false, message: 'Purchases aren’t turned on yet.' };
  }
  try {
    if (!products[pack.product]) await loadPrices();
    const product = products[pack.product];
    if (!product) return { ok: false, message: 'That pack isn’t available right now. Try again in a minute.' };
    const result = await Purchases.purchaseStoreProduct(product);
    return { ok: true, transactionId: result.transaction?.transactionIdentifier ?? `${pack.product}-${Date.now()}` };
  } catch (e) {
    const err = e as { userCancelled?: boolean | null; message?: string };
    if (err.userCancelled) return { ok: false, cancelled: true, message: '' };
    return { ok: false, message: err.message || 'The purchase didn’t go through. You weren’t charged.' };
  }
}
