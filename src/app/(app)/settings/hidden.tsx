import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, EmptyState, LoadingList, Screen, useToast } from '@/components/ui';
import { fetchHiddenAndMuted, setHiddenFrom, setMuted, type HiddenOrMuted } from '@/features/safety/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** People you hid your posts from, and people you muted. Nobody is told. */
export default function HiddenAndMuted() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<HiddenOrMuted[] | null>(null);

  const load = useCallback(() => {
    fetchHiddenAndMuted()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  useFocusEffect(load);

  async function undo(p: HiddenOrMuted, kind: 'hidden' | 'muted') {
    try {
      if (kind === 'hidden') await setHiddenFrom(p.user_id, false);
      else await setMuted(p.user_id, false);
      toast(kind === 'hidden' ? `${p.display_name} can see your posts again` : `Unmuted ${p.display_name}`);
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Hidden and muted" />
      <Screen>
        <AppText tone="muted">
          Hide your posts from someone and they won&apos;t see your pins, your Out or plans. Mute someone and you won&apos;t see theirs. Nobody is told. To
          add someone, open their profile and tap •••.
        </AppText>
        {!list ? (
          <LoadingList rows={3} />
        ) : list.length === 0 ? (
          <EmptyState glyph="lock" title="Nobody here" body="You haven't hidden your posts from anyone or muted anyone." />
        ) : (
          list.map((p) => (
            <View key={p.user_id} style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <Avatar name={p.display_name} uri={p.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.user_id } })}>
                    {p.display_name}
                  </AppText>
                  <AppText variant="caption" tone="subtle">
                    {[p.hidden ? 'Can’t see your posts' : null, p.muted ? 'Muted' : null].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[2], paddingLeft: 52 }}>
                {p.hidden ? <Button label="Show my posts" size="md" variant="secondary" onPress={() => undo(p, 'hidden')} /> : null}
                {p.muted ? <Button label="Unmute" size="md" variant="secondary" onPress={() => undo(p, 'muted')} /> : null}
              </View>
            </View>
          ))
        )}
      </Screen>
    </View>
  );
}
