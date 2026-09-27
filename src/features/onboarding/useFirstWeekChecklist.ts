import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type ChecklistItem = { key: string; label: string; detail?: string; done: boolean; route?: string };

/**
 * The first-week checklist is calculated from real activity, not stored:
 * used an invite, got a vouch, went out with someone (GPS encounter), dropped a pin, made an intro.
 */
export function useFirstWeekChecklist() {
  const { profile, session } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const fetchChecklist = useCallback(async () => {
    if (!userId || !profile) return null;
    const [inviter, encounters, pins, intros, priv] = await Promise.all([
      profile.invited_by
        ? supabase.from('profiles').select('display_name').eq('id', profile.invited_by).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('encounters').select('id', { count: 'exact', head: true }),
      supabase.from('pins').select('id', { count: 'exact', head: true }).eq('author_id', userId),
      supabase.from('intros').select('id', { count: 'exact', head: true }).eq('connector_id', userId),
      supabase.from('profile_private').select('onboarding_checklist_dismissed_at').eq('id', userId).maybeSingle(),
    ]);
    const nextItems: ChecklistItem[] = [
      { key: 'invite', label: 'Used an invite code', detail: inviter.data ? `${inviter.data.display_name} invited you ✓` : undefined, done: !!profile.invited_by },
      { key: 'vouch', label: 'Got your first vouch', detail: profile.vouch_count > 0 ? `${profile.vouch_count} vouch${profile.vouch_count === 1 ? '' : 'es'} ✓` : undefined, done: profile.vouch_count > 0 },
      { key: 'go_out', label: 'Go out with someone', done: (encounters.count ?? 0) > 0, route: '/circles/vouch' },
      { key: 'pin', label: 'Drop your first Pin', done: (pins.count ?? 0) > 0, route: '/pins' },
      { key: 'intro', label: 'Make an Intro', done: (intros.count ?? 0) > 0, route: '/circles/make-intro' },
    ];
    return { items: nextItems, dismissed: !!priv.data?.onboarding_checklist_dismissed_at };
  }, [userId, profile]);

  const load = useCallback(async () => {
    const result = await fetchChecklist();
    if (result) {
      setItems(result.items);
      setDismissed(result.dismissed);
    }
  }, [fetchChecklist]);

  useEffect(() => {
    let cancelled = false;
    fetchChecklist().then((result) => {
      if (result && !cancelled) {
        setItems(result.items);
        setDismissed(result.dismissed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchChecklist]);

  const dismiss = useCallback(async () => {
    if (!userId) return;
    setDismissed(true);
    await supabase.from('profile_private').update({ onboarding_checklist_dismissed_at: new Date().toISOString() }).eq('id', userId);
  }, [userId]);

  return { items, dismissed, dismiss, reload: load };
}
