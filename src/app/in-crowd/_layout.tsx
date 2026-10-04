import { Stack } from 'expo-router';

import { UI } from '@/components/in-crowd/palette';

/** The In Crowd: the hub, the nights, the shop and the guide. */
export default function InCrowdLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: UI.bg }, animation: 'fade' }}>
      {/* No swipe-back mid-night: the pause menu is the way out. */}
      <Stack.Screen name="play/[level]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
