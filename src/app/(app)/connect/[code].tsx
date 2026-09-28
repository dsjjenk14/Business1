import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ConnectedCard } from '@/components/connect/ConnectedCard';
import { BackHeader } from '@/components/nav/AppHeader';
import { EmptyState, LoadingDetail, Screen } from '@/components/ui';
import { redeemConnectCode, type ConnectResult } from '@/features/connect/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Opened from a scanned QR link (imin://connect/<code>) with the phone's own camera: connect right away. */
export default function ConnectFromLink() {
  const t = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !code) return;
    done.current = true;
    redeemConnectCode(code)
      .then(setResult)
      .catch((e) => setError(friendlyError(e)));
  }, [code]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Connect" />
      <Screen>
        {result ? (
          <ConnectedCard result={result} />
        ) : error ? (
          <EmptyState glyph="link" title="Couldn’t connect" body={error} action={{ label: 'Try another way', onPress: () => router.replace('/connect') }} />
        ) : (
          <LoadingDetail />
        )}
      </Screen>
    </View>
  );
}
