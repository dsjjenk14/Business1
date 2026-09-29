import { View } from 'react-native';

import { AppText } from '@/components/ui';
import type { RoomPass } from '@/features/events/room';

/**
 * On phones, rooms open in the browser (Expo Go doesn't include live audio
 * and video); see events/[id]/room. This is never shown there.
 */
export function RoomView(_: { pass: RoomPass; onLeave: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <AppText>Rooms open in your browser.</AppText>
    </View>
  );
}
