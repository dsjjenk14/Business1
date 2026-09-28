import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui';
import { fetchLiveAccess } from '@/features/live/api';
import { useTheme } from '@/theme';

/**
 * The video area of a live stream. It gets a pass from the server (which
 * checks who may watch). The video itself plays through LiveKit's SDK,
 * which is added in the build step described in docs/LIVE-VIDEO.md; it needs
 * a TestFlight / development build (it can't run in Expo Go).
 */
export function LiveVideo({ streamId, isHost }: { streamId: number; isHost: boolean }) {
  const t = useTheme();
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');

  useEffect(() => {
    let alive = true;
    fetchLiveAccess(streamId)
      .then(() => alive && setState('ready'))
      .catch((e) => alive && setState(e instanceof Error ? e.message : 'Live video isn’t available right now.'));
    return () => {
      alive = false;
    };
  }, [streamId]);

  return (
    <View
      style={{ aspectRatio: 9 / 16, maxHeight: 520, width: '100%', borderRadius: t.radius.lg, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: t.space[5] }}
      accessibilityLabel={isHost ? 'Your camera' : 'Live video'}>
      {state === 'loading' ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <AppText align="center" style={{ color: '#FFFFFF' }}>
          {state === 'ready' ? (isHost ? 'Connecting your camera…' : 'Connecting to the live video…') : state}
        </AppText>
      )}
    </View>
  );
}
