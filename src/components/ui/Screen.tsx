import { useState } from 'react';
import { RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { FadeIn } from './FadeIn';

/**
 * Standard scrolling screen body; it eases in as the screen opens. Tab screens get their top inset from the
 * AppHeader; detail screens from BackHeader. Pass `safeTop` for screens with neither.
 */
export function Screen({
  children,
  safeTop,
  padded = true,
  contentGap = 20,
  onRefresh,
  ...rest
}: ScrollViewProps & {
  safeTop?: boolean;
  padded?: boolean;
  contentGap?: number;
  /** Pull down to refresh: called, and the spinner shows until it finishes. */
  onRefresh?: () => Promise<unknown> | void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } catch {
      // the screen shows its own error
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.colors.primary} colors={[t.colors.primary]} /> : undefined}
        contentContainerStyle={{
          paddingTop: safeTop ? insets.top + t.space[4] : t.space[4],
          paddingBottom: insets.bottom + t.space[8],
          paddingHorizontal: padded ? t.space[4] : 0,
          gap: contentGap,
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
        }}
        {...rest}>
        <FadeIn style={{ gap: contentGap }}>{children}</FadeIn>
      </ScrollView>
    </View>
  );
}
