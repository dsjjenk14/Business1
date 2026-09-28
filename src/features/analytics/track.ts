import { supabase } from '@/lib/supabase';

/**
 * Count that a feature was used (e.g. track('pin_posted', { category: 'photos' })).
 * Names only and a few small details: never message or pin text. Fire and
 * forget: tracking never slows the app down or shows an error.
 */
export function track(name: string, props: Record<string, string | number | boolean | null> = {}) {
  supabase
    .rpc('track', { p_name: name, p_props: props })
    .then(
      () => undefined,
      () => undefined,
    );
}
