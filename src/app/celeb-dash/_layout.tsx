import { Stack } from 'expo-router';

import { UI } from '@/components/celeb-dash/palette';

/** Celeb Dash: the hub, the nights, the shop and the guide. */
export default function CelebDashLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: UI.bg }, animation: 'fade' }}>
      {/* No swipe-back mid-night: the pause menu is the way out. */}
      <Stack.Screen name="play/[level]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
