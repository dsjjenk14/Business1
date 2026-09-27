import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function AppLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
      <Stack.Screen name="checklist" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="go-live" options={{ presentation: 'modal' }} />
      <Stack.Screen name="pins/new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
