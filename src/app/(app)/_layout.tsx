import { Stack } from 'expo-router';

import { ScreenError } from '@/components/ScreenError';
import { useAutoArrive } from '@/features/arrival/useAutoArrive';
import { usePush } from '@/features/notifications/usePush';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/** Any screen that crashes shows a friendly message instead of going blank. */
export const ErrorBoundary = ScreenError;

export default function AppLayout() {
  const t = useTheme();
  const { session } = useAuth();
  useAutoArrive(!!session);
  usePush(!!session);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
      <Stack.Screen name="checklist" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="tonight/post" options={{ presentation: 'modal' }} />
      <Stack.Screen name="outs/new" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="outs/view" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="boomerang" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="events/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="pins/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="bills/new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
