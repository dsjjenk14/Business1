import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Screen, Section, useToast } from '@/components/ui';
import { PUSH_SUPPORTED, registerForPush } from '@/features/notifications/push';
import { playSound, setSoundsEnabled } from '@/features/sounds/sounds';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Key = 'notify_messages' | 'notify_date_requests' | 'notify_rsvps' | 'notify_pin_replies' | 'notify_gps_vouch' | 'notify_intro_requests' | 'app_sounds';

const OPTIONS: { key: Key; label: string; detail: string }[] = [
  { key: 'notify_messages', label: 'Messages', detail: 'New messages in your chats and groups' },
  { key: 'notify_date_requests', label: 'Date requests', detail: 'Asks, counters and answers' },
  { key: 'notify_rsvps', label: 'Plans', detail: 'People saying I’m In to your plans or events' },
  { key: 'notify_pin_replies', label: 'Pin replies', detail: 'Replies to your pins' },
  { key: 'notify_gps_vouch', label: 'Meetups and vouches', detail: 'When you meet someone in person and when you get vouched for' },
  { key: 'notify_intro_requests', label: 'Intros', detail: 'Intro requests, intros made for you, and vouch requests' },
];
const COLUMNS = [...OPTIONS.map((o) => o.key), 'app_sounds'].join(', ');

/** Which push notifications you get. Safety alerts always come through. */
export default function NotificationSettings() {
  const t = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [values, setValues] = useState<Record<Key, boolean> | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_settings')
      .select(COLUMNS)
      .eq('user_id', userId)
      .single()
      .then(({ data }) => data && setValues(data as unknown as Record<Key, boolean>));
    registerForPush().then(setPushOn);
  }, [userId]);

  async function toggle(key: Key, value: boolean) {
    if (!userId || !values) return;
    setValues({ ...values, [key]: value });
    if (key === 'app_sounds') {
      setSoundsEnabled(value);
      if (value) playSound('in');
    }
    const patch: Partial<Record<Key, boolean>> = { [key]: value };
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', userId);
    if (error) {
      setValues({ ...values, [key]: !value });
      toast("Couldn't save. Try again.");
    }
  }

  return (
    <>
      <BackHeader title="Notifications" />
      <Screen>
        {!PUSH_SUPPORTED ? (
          <Card>
            <AppText variant="small" tone="muted">
              Push notifications arrive on your phone. Here you can still choose which ones you get.
            </AppText>
          </Card>
        ) : pushOn === false ? (
          <Card accent="primary">
            <View style={{ gap: t.space[2] }}>
              <AppText weight="bold">Notifications are off for I&apos;m In</AppText>
              <AppText variant="small" tone="muted">
                Turn them on in your phone&apos;s Settings so you don&apos;t miss messages, date requests and safety alerts.
              </AppText>
              <Button label="Open phone Settings" size="md" variant="secondary" onPress={() => Linking.openSettings()} />
            </View>
          </Card>
        ) : null}
        <Section title="Send me a notification for">
          {OPTIONS.map((o) => (
            <View key={o.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56 }}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{o.label}</AppText>
                <AppText variant="small" tone="muted">
                  {o.detail}
                </AppText>
              </View>
              <Switch
                accessibilityLabel={o.label}
                value={values?.[o.key] ?? true}
                disabled={!values}
                onValueChange={(v) => toggle(o.key, v)}
                trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
              />
            </View>
          ))}
        </Section>
        <Section title="Sounds">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56 }}>
            <View style={{ flex: 1 }}>
              <AppText weight="bold">Sounds in the app</AppText>
              <AppText variant="small" tone="muted">
                The I&apos;m In chime when something new arrives while the app is open, and a soft sound when you send. Notifications on your
                lock screen use your phone&apos;s sound settings.
              </AppText>
            </View>
            <Switch
              accessibilityLabel="Sounds in the app"
              value={values?.app_sounds ?? true}
              disabled={!values}
              onValueChange={(v) => toggle('app_sounds', v)}
              trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
            />
          </View>
        </Section>
        <AppText variant="caption" tone="subtle">
          Safety alerts from I&apos;m On a Date always come through. Nobody you&apos;ve blocked can reach you.
        </AppText>
      </Screen>
    </>
  );
}
