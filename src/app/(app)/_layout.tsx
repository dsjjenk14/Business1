import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { ScreenError } from '@/components/ScreenError';
import { AccountBlocked, isBlocked, useAccountStatus } from '@/components/safety/AccountBlocked';
import { useAutoArrive } from '@/features/arrival/useAutoArrive';
import { usePush } from '@/features/notifications/usePush';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/** Screens you can use before your photo check is approved. */
const PHOTO_CHECK_OPEN = ['/photo-check', '/settings/photos', '/settings/verification', '/settings/delete-account', '/reset-password'];

/** Any screen that crashes shows a friendly message instead of going blank. */
export const ErrorBoundary = ScreenError;

export default function AppLayout() {
  const t = useTheme();
  const { session } = useAuth();
  useAutoArrive(!!session);
  usePush(!!session);
  // Accounts on hold, suspended or removed see only a notice, never the app.
  const status = useAccountStatus(!!session);
  // Everyone passes the photo check before using the app.
  const path = usePathname();
  const gated = !!status?.needs_photo_check && !PHOTO_CHECK_OPEN.includes(path);
  useEffect(() => {
    if (gated) router.replace('/photo-check');
  }, [gated]);
  if (status && isBlocked(status)) return <AccountBlocked status={status} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
      <Stack.Screen name="checklist" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="tonight/post" options={{ presentation: 'modal' }} />
      <Stack.Screen name="outs/new" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="outs/view" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="events/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="pins/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="bills/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="photo-check" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
