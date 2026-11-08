import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText, Button, Sheet, TextField } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { POLICE_LINES, lineForAppCity, lineNear, type PoliceLine } from '@/features/safety/nonEmergency';
import { useAuth } from '@/lib/auth';
import { callNumber } from '@/lib/sms';
import { useTheme } from '@/theme';

type How = 'location' | 'city' | 'picked';

/** Where the phone is, only if the member already allowed location. Never sent anywhere. */
async function phoneLine(ask: boolean): Promise<PoliceLine | null | 'denied'> {
  try {
    const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return 'denied';
    const pos = (await Location.getLastKnownPositionAsync().catch(() => null)) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return lineNear(pos.coords.latitude, pos.coords.longitude);
  } catch {
    return 'denied';
  }
}

/**
 * The local police non-emergency number. Picks the area from the phone's location (if allowed),
 * then the member's city; they can always choose another area.
 */
export function NonEmergencyLine() {
  const t = useTheme();
  const { profile } = useAuth();
  const { cities } = useAppConfig();
  const citySlug = cities.find((c) => c.id === profile?.city_id)?.slug;
  const cityLine = useMemo(() => lineForAppCity(citySlug), [citySlug]);
  const [found, setFound] = useState<{ line: PoliceLine; how: How } | null>(null);
  const [canAsk, setCanAsk] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    phoneLine(false).then((r) => {
      if (!live) return;
      if (r && r !== 'denied') setFound((f) => (f?.how === 'picked' ? f : { line: r, how: 'location' }));
      setCanAsk(r === 'denied');
    });
    return () => {
      live = false;
    };
  }, []);

  async function askLocation() {
    const r = await phoneLine(true);
    if (r && r !== 'denied') setFound({ line: r, how: 'location' });
    setCanAsk(r === 'denied');
  }

  const current = found ?? (cityLine ? { line: cityLine, how: 'city' as How } : null);
  const list = POLICE_LINES.filter((l) => !query.trim() || `${l.area} ${l.agency}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) =>
    a.area.localeCompare(b.area),
  );

  return (
    <View style={{ gap: t.space[2] }}>
      {current ? (
        <>
          <AppText variant="small" weight="bold">
            Not an emergency? {current.line.agency}
          </AppText>
          <Button label={`Call ${current.line.dial}`} size="md" variant="secondary" onPress={() => callNumber(current.line.dial)} />
          {current.line.outside ? (
            <Button
              label={`From outside ${current.line.area}: ${current.line.outside}`}
              size="md"
              variant="ghost"
              onPress={() => callNumber(current.line.outside as string)}
            />
          ) : null}
          <AppText variant="caption" tone="subtle">
            {current.how === 'location'
              ? `For ${current.line.area}, based on where your phone is. Your location stays on your phone.`
              : current.how === 'city'
                ? `For ${current.line.area}, based on your city in your profile.`
                : `For ${current.line.area}.`}
            {current.line.hours ? ` Answered ${current.line.hours}.` : ''}
          </AppText>
        </>
      ) : (
        <AppText variant="small" tone="muted">
          Not an emergency? Call your local police non-emergency line. If you’re not sure, call 911.
        </AppText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        <Button label={current ? 'Not right? Change area' : 'Find my area'} size="md" variant="ghost" onPress={() => setPicking(true)} />
        {canAsk && current?.how !== 'location' ? <Button label="Use my location" size="md" variant="ghost" onPress={askLocation} /> : null}
      </View>

      <Sheet visible={picking} title="Police non-emergency lines" onClose={() => setPicking(false)}>
        <TextField label="Search" placeholder="City or county" value={query} onChangeText={setQuery} />
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {list.map((l) => (
            <Pressable
              key={l.key}
              accessibilityRole="button"
              accessibilityLabel={`${l.area}, ${l.agency}`}
              onPress={() => {
                setFound({ line: l, how: 'picked' });
                setPicking(false);
              }}
              style={{ paddingVertical: t.space[3], borderBottomWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
              <AppText weight="bold">{l.area}</AppText>
              <AppText variant="small" tone="muted">
                {l.agency} · {l.dial}
              </AppText>
            </Pressable>
          ))}
          {list.length === 0 ? (
            <AppText tone="muted" style={{ paddingVertical: t.space[3] }}>
              We don’t have that area yet. Search for your local police department’s non-emergency number, or call 911 if you’re not sure.
            </AppText>
          ) : null}
        </ScrollView>
      </Sheet>
    </View>
  );
}
