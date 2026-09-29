import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { RoomView } from '@/components/room/RoomView';
import { AppText, Button } from '@/components/ui';
import { parseRoomHash } from '@/features/events/room';
import { useTheme } from '@/theme';

/**
 * The room page phones open in the browser. The pass (good for this one
 * room only) comes after the # in the link, so no sign-in is needed here.
 */
export default function RoomPage() {
  const t = useTheme();
  const router = useRouter();
  const [pass] = useState(() => (Platform.OS === 'web' && typeof window !== 'undefined' ? parseRoomHash(window.location.hash) : null));
  const [left, setLeft] = useState(false);

  if (!pass || left) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.space[3], padding: t.space[5], backgroundColor: t.colors.bg }}>
        <AppText variant="h2" align="center">
          {left ? 'You left the room' : 'This room link isn’t valid'}
        </AppText>
        <AppText tone="muted" align="center">
          {left ? 'You can close this page and go back to I’m In.' : 'Open the event in I’m In and tap Join again.'}
        </AppText>
        <Button label="Open I’m In" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }
  return <RoomView pass={pass} onLeave={() => setLeft(true)} />;
}
