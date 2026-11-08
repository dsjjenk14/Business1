import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { AppText, Card, GlyphTitle, useToast } from '@/components/ui';
import { fetchGroupStats, setBeginnerFriendly, type GroupStats } from '@/features/groups/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** For the owner and co-hosts: this week's numbers and the Beginner friendly tag. */
export function GroupOwnerTools({ groupId, beginnerFriendly, onChanged }: { groupId: number; beginnerFriendly: boolean; onChanged: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [stats, setStats] = useState<GroupStats | null>(null);

  const load = useCallback(() => {
    fetchGroupStats(groupId)
      .then(setStats)
      .catch(() => setStats(null));
  }, [groupId]);
  useEffect(load, [load]);

  const names = (list: string[], max = 5) => (list.length > max ? `${list.slice(0, max).join(', ')} and ${list.length - max} more` : list.join(', '));

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <GlyphTitle glyph="medal">This week</GlyphTitle>
        {stats ? (
          <>
            <View style={{ gap: 2 }}>
              <AppText weight="bold">
                {stats.new_this_week} new {stats.new_this_week === 1 ? 'member' : 'members'} · {stats.members} total
              </AppText>
              {stats.new_names.length ? (
                <AppText variant="small" tone="muted">
                  {names(stats.new_names)}
                </AppText>
              ) : null}
            </View>
            <View style={{ gap: 2 }}>
              <AppText weight="bold">
                {stats.next_event ? `${stats.next_event.going.length} coming to ${stats.next_event.title}` : 'No event coming up'}
              </AppText>
              <AppText variant="small" tone="muted">
                {stats.next_event
                  ? `${dayTime(stats.next_event.starts_at)}${stats.next_event.going.length ? ` · ${names(stats.next_event.going)}` : ''}`
                  : 'Post one with + Event so members have something to say I’m In to.'}
              </AppText>
            </View>
          </>
        ) : (
          <AppText variant="small" tone="muted">
            Loading…
          </AppText>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Beginner friendly</AppText>
            <AppText variant="small" tone="muted">
              Shows a tag and puts your group first for people just starting out.
            </AppText>
          </View>
          <Switch
            value={beginnerFriendly}
            accessibilityLabel="Beginner friendly"
            onValueChange={(on) =>
              setBeginnerFriendly(groupId, on)
                .then(onChanged)
                .catch((e) => toast(friendlyError(e)))
            }
            trackColor={{ true: t.colors.trust, false: t.colors.borderStrong }}
          />
        </View>
      </View>
    </Card>
  );
}
