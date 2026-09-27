import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Card, Screen } from '@/components/ui';
import { REPORT_REASONS, fetchMyReports, type MyReport } from '@/features/safety/api';
import { timeAgo } from '@/lib/time';

const STATUS: Record<MyReport['status'], { label: string; tone: 'sponsored' | 'ai' | 'trust' | 'neutral' }> = {
  open: { label: 'Received', tone: 'sponsored' },
  reviewing: { label: 'Under review', tone: 'ai' },
  resolved: { label: 'Action taken', tone: 'trust' },
  dismissed: { label: 'Closed', tone: 'neutral' },
};

/** Reports you've filed and where they stand. Moderator notes are never shown. */
export default function MyReports() {
  const [list, setList] = useState<MyReport[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchMyReports().then(setList).catch(() => setList([]));
    }, []),
  );

  return (
    <>
      <BackHeader title="My reports" />
      <Screen>
        <AppText tone="muted">We review reports promptly, usually within 24 hours. If you&apos;re in danger, call 911.</AppText>
        {list?.length === 0 ? <AppText tone="subtle">You haven&apos;t filed any reports.</AppText> : null}
        {list?.map((r) => (
          <Card key={r.id}>
            <AppText weight="bold">{REPORT_REASONS.find((x) => x.key === r.reason)?.label ?? r.reason}</AppText>
            <AppText variant="small" tone="muted">
              {r.about === 'member' ? 'Member' : r.about === 'pin' ? 'Pin' : r.about === 'message' ? 'Message' : 'Reply'} by {r.reported_name ?? 'a deleted account'} · {timeAgo(r.created_at)}
            </AppText>
            <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
          </Card>
        ))}
      </Screen>
    </>
  );
}
