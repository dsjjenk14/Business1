import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, Chip, Screen, Section, useToast } from '@/components/ui';
import { SAFETY_MIN_VOUCHES, useGhostMode } from '@/features/safety/ghost';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Key = 'show_in_nearby' | 'show_going_out_venue' | 'show_locked_in' | 'messages_need_vouches' | 'allow_intro_requests' | 'discoverable';

const OPTIONS: { key: Key; label: string; detail: string }[] = [
  { key: 'show_in_nearby', label: 'Show me when I go out', detail: 'Appear on Home and Tonight when you tap I\'m In tonight' },
  { key: 'show_going_out_venue', label: 'Show where I’m going', detail: 'Show the venue when you go out (otherwise just “going out”). Off by default' },
  { key: 'show_locked_in', label: 'Show Locked In', detail: 'Your Insiders see who you go out with most (names only, never places). Off also leaves you out of other people’s Locked In' },
  { key: 'messages_need_vouches', label: `Only people with ${SAFETY_MIN_VOUCHES} vouches can message me`, detail: 'New chats only from Insiders who’ve been vouched for in person. Chats you already have stay open' },
  { key: 'allow_intro_requests', label: 'Allow intro requests', detail: 'Let people one intro away ask an Insider you share to introduce you' },
  { key: 'discoverable', label: 'Show me in search', detail: 'People outside your Insiders can find you by name' },
];

const DELAYS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'Right away' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
];
const COLUMNS = [...OPTIONS.map((o) => o.key), 'here_delay_minutes'].join(', ');

/** Privacy and safety switches (saved instantly). */
export default function Privacy() {
  const t = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { ghost, setGhost } = useGhostMode();
  const [values, setValues] = useState<(Record<Key, boolean> & { here_delay_minutes: number }) | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_settings')
      .select(COLUMNS)
      .eq('user_id', userId)
      .single()
      .then(({ data }) => data && setValues(data as unknown as Record<Key, boolean> & { here_delay_minutes: number }));
  }, [userId]);

  async function save(patch: Partial<Record<Key, boolean>> | { here_delay_minutes: number }) {
    if (!userId || !values) return;
    const before = values;
    setValues({ ...values, ...patch });
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', userId);
    if (error) {
      setValues(before);
      toast("Couldn't save. Try again.");
    }
  }

  async function toggleGhost(on: boolean) {
    const ok = await setGhost(on);
    toast(ok ? (on ? 'Ghost mode is on. Nobody sees you’re out.' : 'Ghost mode is off') : "Couldn't save. Try again.");
  }

  return (
    <>
      <BackHeader title="Privacy and safety" />
      <Screen>
        <Card accent={ghost ? 'primary' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold">Ghost mode</AppText>
              <AppText variant="small" tone="muted">
                Hide that you’re out, and where, from everyone, Insiders included, until you turn it off. You can still use everything else.
              </AppText>
            </View>
            <Switch
              accessibilityLabel="Ghost mode"
              value={!!ghost}
              disabled={ghost === null}
              onValueChange={toggleGhost}
              trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
            />
          </View>
        </Card>

        <AppText tone="muted">Your email, phone number, birthday and exact location are never shown to anyone.</AppText>

        <Section title="When I arrive somewhere">
          <AppText variant="small" tone="muted">
            Wait before the people you chose see you’ve arrived, so nobody can show up the moment you get there.
          </AppText>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {DELAYS.map((d) => (
              <Chip
                key={d.minutes}
                label={d.label}
                selected={values?.here_delay_minutes === d.minutes}
                accessibilityLabel={`Show I've arrived ${d.minutes ? `after ${d.label}` : 'right away'}`}
                onPress={() => values && save({ here_delay_minutes: d.minutes })}
              />
            ))}
          </View>
        </Section>

        <Section title="Who sees what">
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
                value={values?.[o.key] ?? false}
                disabled={!values}
                onValueChange={(v) => save({ [o.key]: v })}
                trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
              />
            </View>
          ))}
        </Section>

        <Section title="Always on">
          <AppText variant="small" tone="muted">
            To see who’s out from outside your Insiders, people need {SAFETY_MIN_VOUCHES} vouches from meeting people in person. Nobody sees how far
            away you are, other people aren’t shown on the map, and your vouch count always shows.
          </AppText>
          <AppText variant="small" tone="subtle">
            We count which features get used (like &quot;a pin was posted&quot;) to make I&apos;m In better. We never record what you write. Details are
            in the Privacy Policy.
          </AppText>
        </Section>
      </Screen>
    </>
  );
}
