import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen, Section, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Key = 'show_in_nearby' | 'show_going_out_venue' | 'show_vouch_count' | 'allow_intro_requests' | 'discoverable';

const OPTIONS: { key: Key; label: string; detail: string }[] = [
  { key: 'show_in_nearby', label: 'Show me when I go out', detail: 'Appear on Home and Tonight when you tap I\'m In tonight' },
  { key: 'show_going_out_venue', label: 'Show where I’m going', detail: 'Show the venue when you go out (otherwise just “going out”)' },
  { key: 'show_vouch_count', label: 'Show my vouch count', detail: 'Others see how many vouches you have' },
  { key: 'allow_intro_requests', label: 'Allow intro requests', detail: 'Let people one intro away ask a mutual friend to introduce you' },
  { key: 'discoverable', label: 'Show me in search', detail: 'People outside your circle can find you by name' },
];

/** Privacy switches (saved instantly). */
export default function Privacy() {
  const t = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [values, setValues] = useState<Record<Key, boolean> | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_settings')
      .select('show_in_nearby, show_going_out_venue, show_vouch_count, allow_intro_requests, discoverable')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => data && setValues(data));
  }, [userId]);

  async function toggle(key: Key, value: boolean) {
    if (!userId || !values) return;
    setValues({ ...values, [key]: value });
    const patch: Partial<Record<Key, boolean>> = { [key]: value };
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', userId);
    if (error) {
      setValues({ ...values, [key]: !value });
      toast("Couldn't save. Try again.");
    }
  }

  return (
    <>
      <BackHeader title="Privacy" />
      <Screen>
        <AppText tone="muted">Your email, phone number, birthday and exact location are never shown to anyone.</AppText>
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
                value={values?.[o.key] ?? true}
                disabled={!values}
                onValueChange={(v) => toggle(o.key, v)}
                trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
              />
            </View>
          ))}
        </Section>
      </Screen>
    </>
  );
}
