import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { RoomView } from '@/components/room/RoomView';
import { Button, EmptyState, LoadingDetail, Screen } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { fetchRoomPass, RoomError, roomWebLink, type RoomPass } from '@/features/events/room';
import { goBackOr } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * A virtual event's room. In a browser it opens right here. On phones it
 * opens in the browser, since Expo Go can't do live audio and video; the
 * App Store version will open it in the app.
 */
export default function EventRoom() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pass, setPass] = useState<RoomPass | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRoomPass(Number(id))
      .then((p) => {
        if (cancelled) return;
        setPass(p);
        track('event_room_join', { kind: p.kind, role: p.role, platform: Platform.OS });
        if (Platform.OS !== 'web') {
          setOpened(true);
          WebBrowser.openBrowserAsync(roomWebLink(p)).catch(() => undefined);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof RoomError ? e : new RoomError('The room isn’t available right now.', null)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const leave = () => goBackOr(router, `/events/${id}`);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Room" />
        <Screen>
          <EmptyState
            glyph={error.code === 'not_configured' ? 'spark' : 'warning'}
            title={error.code === 'not_configured' ? 'Coming soon' : 'Can’t join yet'}
            body={error.code === 'not_configured' ? 'Voice and video rooms are almost ready. For now, hosts can add their own link (Zoom, Google Meet…).' : error.message}
            action={{ label: 'Back to the event', onPress: leave }}
          />
        </Screen>
      </View>
    );
  }
  if (!pass) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Room" />
        <LoadingDetail />
      </View>
    );
  }
  if (Platform.OS === 'web') return <RoomView pass={pass} onLeave={leave} />;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={pass.title} />
      <Screen>
        <EmptyState
          glyph="camera"
          title={opened ? 'The room opened in your browser' : 'Opening the room…'}
          body="Allow the camera and microphone when your browser asks. Come back here when you're done."
          action={{ label: 'Open the room again', onPress: () => WebBrowser.openBrowserAsync(roomWebLink(pass)).catch(() => undefined) }}
        />
        <Button label="Back to the event" variant="ghost" onPress={leave} />
      </Screen>
    </View>
  );
}
