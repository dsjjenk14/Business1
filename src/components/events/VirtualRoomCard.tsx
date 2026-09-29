import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';

import { AppText, Button, Card, useToast } from '@/components/ui';
import type { EventDetail } from '@/features/events/api';
import { ROOM_KINDS } from '@/features/events/room';
import { useTheme } from '@/theme';

const JOIN: Record<'voice' | 'video' | 'stream', { guest: string; host: string }> = {
  video: { guest: 'Join the video call', host: 'Start the video call' },
  voice: { guest: 'Join the voice chat', host: 'Open the voice chat' },
  stream: { guest: 'Watch the livestream', host: 'Go live' },
};

/** How to join an online event: the room (when it's open) or the host's link. */
export function VirtualRoomCard({ event, ended }: { event: EventDetail; ended: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  if (event.format === 'in_person' || !event.room_kind) return null;
  const kind = ROOM_KINDS.find((k) => k.key === event.room_kind)!;
  const inIt = event.i_am_going || event.can_run_room;

  let action: React.ReactNode = null;
  if (ended) {
    action = (
      <AppText variant="small" tone="muted">
        This event has ended.
      </AppText>
    );
  } else if (event.room_kind === 'link') {
    action = event.join_url ? (
      <Button label="Open the link" onPress={() => Linking.openURL(event.join_url!).catch(() => toast('Couldn’t open that link.'))} />
    ) : (
      <AppText variant="small" tone="muted">
        Say I&apos;m In to get the link.
      </AppText>
    );
  } else if (!inIt) {
    action = (
      <AppText variant="small" tone="muted">
        Say I&apos;m In to join. The room opens 15 minutes before the start.
      </AppText>
    );
  } else if (event.room_open) {
    const label = JOIN[event.room_kind][event.can_run_room ? 'host' : 'guest'];
    action = <Button label={label} onPress={() => router.push({ pathname: '/events/[id]/room', params: { id: String(event.id) } })} />;
  } else {
    action = (
      <AppText variant="small" tone="muted">
        The room opens 15 minutes before the start. We&apos;ll be here.
      </AppText>
    );
  }

  return (
    <Card accent="primary">
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <Ionicons name={kind.icon} size={24} color={t.colors.primaryText} />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">
              {event.format === 'hybrid' ? 'In person and online' : 'Online'} · {kind.label}
            </AppText>
            <AppText variant="small" tone="muted">
              {kind.detail}
            </AppText>
          </View>
        </View>
        {action}
      </View>
    </Card>
  );
}
