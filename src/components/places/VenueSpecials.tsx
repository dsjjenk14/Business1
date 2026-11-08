import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, GlyphTitle, Section, TextField, useToast } from '@/components/ui';
import { canPostSpecial, fetchSpecials, postSpecial, type Special } from '@/features/places/specials';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

function SpecialCard({ special, showPlace }: { special: Special; showPlace?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card
      accent="sponsored"
      onPress={showPlace ? () => router.push({ pathname: '/venues/[id]', params: { id: String(special.venue_id) } }) : undefined}
      accessibilityLabel={showPlace ? `${special.title} at ${special.venue_name}` : undefined}>
      <View style={{ gap: t.space[1] }}>
        <GlyphTitle glyph="wine" tone="sponsored">
          {special.title}
        </GlyphTitle>
        {special.details ? (
          <AppText variant="small" tone="muted">
            {special.details}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="subtle">
          {showPlace ? `${special.venue_name}${special.neighborhood ? ` · ${special.neighborhood}` : ''} · ` : ''}Tonight only
        </AppText>
      </View>
    </Card>
  );
}

/** On a place's page: tonight's special, and a form for the place's manager. */
export function VenueSpecials({ venueId }: { venueId: number }) {
  const t = useTheme();
  const toast = useToast();
  const [specials, setSpecials] = useState<Special[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchSpecials(venueId)
      .then(setSpecials)
      .catch(() => undefined);
    canPostSpecial(venueId)
      .then(setCanPost)
      .catch(() => setCanPost(false));
  }, [venueId]);
  useEffect(load, [load]);

  async function post() {
    setBusy(true);
    try {
      await postSpecial(venueId, title, details);
      toast('Tonight’s special is up');
      setWriting(false);
      setTitle('');
      setDetails('');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!specials.length && !canPost) return null;
  return (
    <Section title="Tonight’s special">
      {specials.map((s) => (
        <SpecialCard key={s.id} special={s} />
      ))}
      {canPost && !writing && !specials.length ? (
        <Button label="Post tonight’s special" variant="secondary" onPress={() => setWriting(true)} />
      ) : null}
      {canPost && writing ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            <TextField label="The special" value={title} onChangeText={setTitle} maxLength={80} placeholder="Half-price wings until 9" />
            <TextField label="Details" optional value={details} onChangeText={setDetails} maxLength={300} multiline placeholder="Show your I'm In profile at the bar." />
            <AppText variant="caption" tone="subtle">
              Shows on your page and on What&apos;s In until 4 AM. One special a day.
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="Post it" style={{ flex: 1 }} onPress={post} loading={busy} disabled={title.trim().length < 2} />
              <Button label="Cancel" variant="ghost" onPress={() => setWriting(false)} />
            </View>
          </View>
        </Card>
      ) : null}
    </Section>
  );
}

/** On What's In: every partner's special tonight. */
export function SpecialsTonight() {
  const [specials, setSpecials] = useState<Special[]>([]);
  useEffect(() => {
    fetchSpecials()
      .then(setSpecials)
      .catch(() => undefined);
  }, []);
  if (!specials.length) return null;
  return (
    <Section title="Specials tonight">
      {specials.slice(0, 5).map((s) => (
        <SpecialCard key={s.id} special={s} showPlace />
      ))}
    </Section>
  );
}
