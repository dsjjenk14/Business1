import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { PUSH_SUPPORTED, registerForPush } from './push';

const linkOf = (r: Notifications.NotificationResponse | null) => {
  const link = r?.notification.request.content.data?.link;
  return typeof link === 'string' && link.startsWith('/') ? link : null;
};

/** Signed in: register this phone for push, and open the right screen when a notification is tapped. */
export function usePush(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !PUSH_SUPPORTED) return;
    registerForPush();

    // Opened the app by tapping a notification.
    const first = linkOf(Notifications.getLastNotificationResponse());
    if (first) {
      Notifications.clearLastNotificationResponse();
      router.push(first as Href);
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = linkOf(r);
      if (link) router.push(link as Href);
    });
    return () => sub.remove();
  }, [enabled, router]);
}
