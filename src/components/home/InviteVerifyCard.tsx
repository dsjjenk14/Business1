import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Joined with someone's invite code but haven't verified your phone yet: the
 * code only makes you Insiders with them once you do (the server enforces it).
 */
export function InviteVerifyCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const [inviter, setInviter] = useState<string | null>(null);
  const me = profile?.id;
  const invitedBy = profile?.invited_by;

  useFocusEffect(
    useCallback(() => {
      if (!me || !invitedBy) return;
      let alive = true;
      Promise.all([
        supabase.from('profile_private').select('phone_verified_at').eq('id', me).maybeSingle(),
        supabase.from('profiles').select('display_name').eq('id', invitedBy).maybeSingle(),
      ]).then(([priv, inv]) => {
        if (!alive) return;
        setInviter(priv.data?.phone_verified_at ? null : (inv.data?.display_name ?? 'the person who invited you'));
      });
      return () => {
        alive = false;
      };
    }, [me, invitedBy]),
  );

  if (!inviter) return null;
  return (
    <Card accent="primary" onPress={() => router.push('/verify-phone')} accessibilityLabel={`Verify your phone to connect with ${inviter}`}>
      <AppText weight="bold">Verify your phone to connect with {inviter.split(' ')[0]}</AppText>
      <AppText variant="small" tone="muted">
        You joined with their code. Once you confirm your number with a text code, you&apos;ll be each other&apos;s Insiders.
      </AppText>
    </Card>
  );
}
