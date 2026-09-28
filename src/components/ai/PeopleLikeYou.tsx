import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { AIMark, AppText, Button, IconButton, LoadingList, Section, useToast } from '@/components/ui';
import { aiErrorText, fetchPeopleLikeYou, mergePicks, quotaText, runAI, sharedLine, type AIQuota, type LikeYou, type PeoplePicks } from '@/features/ai/api';
import { track } from '@/features/analytics/track';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/**
 * People like you: people you don't know yet who share your interests, groups,
 * spots and nights out. The list itself is free and instant; the AI picks the
 * best few once a day and says why (marked with the spark).
 */
const firstName = (name: string) => name.split(' ')[0] ?? name;

export function PeopleLikeYou({ limit = 8, compact = false }: { limit?: number; compact?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const [people, setPeople] = useState<LikeYou[] | null>(null);
  const [picks, setPicks] = useState<PeoplePicks | null>(null);
  const [quota, setQuota] = useState<AIQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const hasInterests = (profile?.interests?.length ?? 0) > 0;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPeopleLikeYou(15)
        .then((list) => {
          if (cancelled) return;
          setPeople(list);
          // The daily AI pick is automatic and doesn't use a free AI use.
          if (list.length)
            runAI<PeoplePicks>('people_like_you')
              .then((r) => !cancelled && (setPicks(r.result), setQuota(r.quota)))
              .catch(() => undefined);
        })
        .catch(() => !cancelled && setPeople([]));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function refresh() {
    setBusy(true);
    try {
      const r = await runAI<PeoplePicks>('people_like_you', { refresh: true });
      setPicks(r.result);
      setQuota(r.quota);
      track('ai_used', { feature: 'people_like_you', refresh: true });
    } catch (e) {
      toast(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const list = people ? mergePicks(people, picks).slice(0, limit) : null;
  const left = quotaText(quota);

  return (
    <Section title="People like you">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <View style={{ flex: 1, gap: 2 }}>
          {picks?.picks.length ? <AIMark label="AI picks" /> : null}
          <AppText variant="caption" tone="subtle">
            Into the same things, in the same groups, out on the same nights. A friend you share still has to introduce you.
          </AppText>
        </View>
        {!compact && picks?.picks.length ? (
          <IconButton icon="refresh-outline" label="New AI picks" onPress={() => !busy && refresh()} />
        ) : null}
      </View>

      {!hasInterests ? (
        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" tone="muted">
            Add a few interests so we can find people who are into the same things.
          </AppText>
          <Button label="Add your interests" size="md" variant="secondary" onPress={() => router.push('/settings/profile')} />
        </View>
      ) : null}

      {!list ? (
        <LoadingList rows={3} />
      ) : list.length === 0 ? (
        hasInterests ? (
          <AppText variant="small" tone="muted">
            No one new yet. Join a group or go out with your circle, and people you&apos;d click with show up here.
          </AppText>
        ) : null
      ) : (
        list.map((p) => (
          <PersonRow
            key={p.user_id}
            id={p.user_id}
            name={p.display_name}
            avatarUrl={p.avatar_url}
            vouches={p.vouch_count}
            ring={p.reason ? 'ai' : null}
            detail={p.reason ? null : sharedLine(p.shared) || p.headline}
            extra={
              <>
                {p.reason ? (
                  <AppText variant="caption" tone="ai" numberOfLines={compact ? 2 : 3}>
                    {p.reason}
                  </AppText>
                ) : null}
                {p.degree === 2 && p.via ? (
                  p.intro_requested ? (
                    <AppText variant="caption" tone="subtle">
                      You asked {firstName(p.via.display_name)} to introduce you
                    </AppText>
                  ) : (
                    <AppText
                      variant="caption"
                      weight="bold"
                      tone="trust"
                      accessibilityRole="button"
                      accessibilityLabel={`Ask ${p.via.display_name} to introduce you to ${p.display_name}`}
                      onPress={() => router.push({ pathname: '/circles/request-intro', params: { target: p.user_id } })}>
                      Ask {firstName(p.via.display_name)} to introduce you →
                    </AppText>
                  )
                ) : (
                  <AppText variant="caption" tone="subtle">
                    No mutual friend yet to introduce you
                  </AppText>
                )}
              </>
            }
          />
        ))
      )}
      {compact && list?.length ? (
        <AppText
          variant="small"
          tone="primary"
          weight="bold"
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/circles', params: { tab: 'network' } })}>
          See everyone →
        </AppText>
      ) : null}
      {!compact && left ? (
        <AppText variant="caption" tone="subtle">
          {left}. Refresh uses one; the daily picks are free.
        </AppText>
      ) : null}
    </Section>
  );
}
