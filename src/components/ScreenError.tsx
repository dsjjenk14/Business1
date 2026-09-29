import type { ErrorBoundaryProps } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, EmptyState } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { useTheme } from '@/theme';

/** Shown instead of a blank screen if a screen crashes. */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const t = useTheme();
  const router = useRouter();
  useEffect(() => {
    track('screen_error', { message: error.message.slice(0, 120) });
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, justifyContent: 'center', padding: t.space[5], gap: t.space[3] }}>
      <EmptyState glyph="warning" title="Something went wrong" body="This screen hit a problem. Try again, or go back." action={{ label: 'Try again', onPress: retry }} />
      <Button label="Go back" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}
