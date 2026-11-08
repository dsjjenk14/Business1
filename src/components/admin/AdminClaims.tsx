import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, Chip, Section, TextField, useToast } from '@/components/ui';
import { fetchPendingClaims, reviewClaim, setVerifiedHost, type ClaimForReview } from '@/features/places/specials';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Admin: check that a place is really claimed by its owner, then approve. */
export function AdminClaims({ venues, onChange }: { venues: { id: number; name: string }[]; onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [claims, setClaims] = useState<ClaimForReview[]>([]);
  const [pick, setPick] = useState<Record<number, number>>({});
  const [query, setQuery] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    fetchPendingClaims()
      .then(setClaims)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  async function review(c: ClaimForReview, approve: boolean) {
    try {
      await reviewClaim(c.id, approve, pick[c.id] ?? c.venue_id);
      toast(approve ? `${c.business_name} approved. They can start their partnership now.` : 'Turned down. They’ve been told.');
      load();
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <Section title={`Place claims (${claims.length})`}>
      {claims.length === 0 ? <AppText tone="muted">None waiting.</AppText> : null}
      {claims.map((c) => {
        const q = (query[c.id] ?? '').toLowerCase();
        const matches = q.length >= 2 ? venues.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 6) : [];
        return (
          <Card key={c.id}>
            <View style={{ gap: t.space[2] }}>
              <AppText weight="bold">{c.business_name}</AppText>
              <AppText variant="small" tone="muted">
                {[c.contact_name, c.phone, c.address].filter(Boolean).join(' · ')}
              </AppText>
              <AppText variant="small">Perk: {c.perk}</AppText>
              {!c.venue_id ? (
                <>
                  <TextField
                    label="Which place is it?"
                    value={query[c.id] ?? ''}
                    onChangeText={(v) => setQuery((s) => ({ ...s, [c.id]: v }))}
                    placeholder="Search your venues (add it above if it's missing)"
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                    {matches.map((v) => (
                      <Chip key={v.id} label={v.name} selected={pick[c.id] === v.id} onPress={() => setPick((s) => ({ ...s, [c.id]: v.id }))} />
                    ))}
                  </View>
                </>
              ) : null}
              <AppText variant="caption" tone="subtle">
                Call the business or check their website to confirm this person works there before approving.
              </AppText>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button label="Approve" size="md" variant="trust" style={{ flex: 1 }} disabled={!c.venue_id && !pick[c.id]} onPress={() => review(c, true)} />
                <Button label="Turn down" size="md" variant="ghost" style={{ flex: 1 }} onPress={() => review(c, false)} />
              </View>
            </View>
          </Card>
        );
      })}
    </Section>
  );
}

/** Admin: verified hosts' vouches count double toward the safety rules. */
export function AdminVerifiedHosts() {
  const t = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (on: boolean) => {
    setBusy(true);
    try {
      await setVerifiedHost(email, on);
      toast(on ? 'They’re a verified host now' : 'Verified host removed');
      setEmail('');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Verified hosts">
      <AppText variant="small" tone="muted">
        People who run events and you trust. They get a Verified host badge, and their vouches count double.
      </AppText>
      <TextField label="Member's email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button label="Make verified host" size="md" style={{ flex: 1 }} onPress={() => save(true)} loading={busy} disabled={!email.includes('@')} />
        <Button label="Remove" size="md" variant="ghost" onPress={() => save(false)} disabled={busy || !email.includes('@')} />
      </View>
    </Section>
  );
}
