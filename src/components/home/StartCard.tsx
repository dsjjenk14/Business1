import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Step = { key: string; label: string; done: boolean; href: Href };

const hiddenKey = (userId: string) => `start_card_hidden:${userId}`;

/**
 * The first 5 minutes: four quick things with a progress bar, on Home for
 * new members until they're done (or hidden). Worked out from what they've
 * actually done, so it ticks itself off.
 */
export function StartCard() {
  const t = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const me = session?.user.id;
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const [isNew, setIsNew] = useState(false);

  const createdAt = profile?.created_at;
  const load = useCallback(() => {
    if (!me) return;
    let live = true;
    (async () => {
      const wasHidden = await AsyncStorage.getItem(hiddenKey(me)).catch(() => null);
      const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const [events, groups, pins, insiders] = await Promise.all([
        count(supabase.from('event_rsvps').select('event_id', { count: 'exact', head: true }).eq('user_id', me)),
        count(supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', me)),
        count(supabase.from('pins').select('id', { count: 'exact', head: true }).eq('author_id', me)),
        count(supabase.from('connections').select('user_a', { count: 'exact', head: true }).or(`user_a.eq.${me},user_b.eq.${me}`)),
      ]);
      if (!live) return;
      setHidden(wasHidden === '1');
      // Only for the first two weeks.
      setIsNew(createdAt ? Date.now() - new Date(createdAt).getTime() < 14 * 86_400_000 : false);
      setSteps([
        { key: 'contacts', label: 'Find friends already here', done: insiders > 0, href: Platform.OS === 'web' ? '/connect' : '/connect/contacts' },
        { key: 'event', label: 'Say I’m In to an event', done: events > 0, href: '/whats-in' },
        { key: 'group', label: 'Join a group', done: groups > 0, href: '/groups/near' },
        { key: 'pin', label: 'Post your first pin', done: pins > 0, href: '/pins/new' },
      ]);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [me, createdAt]);
  useFocusEffect(load);

  if (!steps || hidden || !isNew) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Card accent="primary">
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <AppText variant="h3" accessibilityRole="header">
            Get started
          </AppText>
          <AppText variant="small" tone="muted">
            {done} of {steps.length}
          </AppText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: steps.length, now: done }}
          style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(6, (done / steps.length) * 100)}%`, height: '100%', backgroundColor: t.colors.primary, borderRadius: 4 }} />
        </View>
        {steps.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={`${s.label}${s.done ? ', done' : ''}`}
            onPress={() => !s.done && router.push(s.href)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 40, opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.done ? t.colors.trust : t.colors.textSubtle} />
            <AppText style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }} tone={s.done ? 'muted' : 'text'}>
              {s.label}
            </AppText>
            {!s.done ? <Ionicons name="chevron-forward" size={16} color={t.colors.textSubtle} /> : null}
          </Pressable>
        ))}
        <Button
          label="Hide this"
          size="md"
          variant="ghost"
          onPress={() => {
            setHidden(true);
            if (me) AsyncStorage.setItem(hiddenKey(me), '1').catch(() => undefined);
          }}
        />
      </View>
    </Card>
  );
}
