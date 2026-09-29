import { ScrollView, View, type ScrollViewProps } from 'react-native';
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
  ...rest
}: ScrollViewProps & { safeTop?: boolean; padded?: boolean; contentGap?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
