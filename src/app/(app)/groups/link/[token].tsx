import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { EmptyState, LoadingDetail, Screen } from '@/components/ui';
import { joinGroupByLink } from '@/features/groups/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Opened from a group's invite link: join, then go to the group. */
export default function JoinGroupFromLink() {
  const t = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !token) return;
    done.current = true;
    joinGroupByLink(token)
      .then((id) => router.replace({ pathname: '/groups/[id]', params: { id: String(id) } }))
      .catch((e) => setError(friendlyError(e)));
  }, [token, router]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Join group" />
      <Screen>
        {error ? (
          <EmptyState glyph="link" title="Couldn’t join" body={error} action={{ label: 'See groups', onPress: () => router.replace('/circles') }} />
        ) : (
          <LoadingDetail />
        )}
      </Screen>
    </View>
  );
}
