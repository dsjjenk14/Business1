import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Badge, Button, Card, Chip, EmptyState, Glyph, LoadingList, Screen, Section, Segmented, Skeleton, TextField, useToast, type GlyphName } from '@/components/ui';
import {
  actOnReport,
  addPlacement,
  addVenue,
  endPlacement,
  fetchInquiries,
  fetchLaunchMetrics,
  fetchOverview,
  fetchPlacements,
  fetchReports,
  fetchRevenue,
  fetchUsage,
  fetchVenues,
  fetchVerifications,
  grantPremium,
  reviewVerification,
  setInquiryStatus,
  signedSelfie,
  type AdminReport,
  type AdminVenue,
  type AdminVerification,
  type Inquiry,
  type LaunchMetrics,
  type Overview,
  type Placement,
  type RevenueRow,
  type UsageRow,
} from '@/features/admin/api';
import { money } from '@/features/payments/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

type Tab = 'launch' | 'reports' | 'verify' | 'places' | 'more';

/** Admin: reports, photo verification, venues + Featured placements, partner inquiries, Premium. */
export default function Admin() {
  const t = useTheme();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('launch');
  const [overview, setOverview] = useState<Overview | null>(null);

  const isAdmin = profile?.role === 'admin';
  const refreshOverview = useCallback(() => {
    if (!isAdmin) return;
    fetchOverview()
      .then(setOverview)
      .catch(() => undefined);
  }, [isAdmin]);
  useFocusEffect(refreshOverview);

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Admin" />
        <Screen>
          {profile ? <EmptyState glyph="lock" title="Admins only" /> : <LoadingList rows={2} />}
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Admin" />
      <Screen contentGap={t.space[4]}>
        {overview ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Badge label={`${overview.members} members`} tone="neutral" />
            <Badge label={`${overview.founding_left} founding spots left`} tone="sponsored" />
            <Badge label={`${overview.open_reports} open reports`} tone={overview.open_reports ? 'primary' : 'neutral'} />
            <Badge label={`${overview.pending_verifications} to verify`} tone={overview.pending_verifications ? 'ai' : 'neutral'} />
            <Badge label={`${overview.new_inquiries} new partners`} tone={overview.new_inquiries ? 'trust' : 'neutral'} />
          </View>
        ) : null}
        <Segmented<Tab>
          options={[
            { key: 'launch', label: 'Launch' },
            { key: 'reports', label: 'Reports' },
            { key: 'verify', label: 'Verify' },
            { key: 'places', label: 'Places' },
            { key: 'more', label: 'More' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'launch' ? <Launch /> : tab === 'reports' ? <Reports onChange={refreshOverview} /> : tab === 'verify' ? <Verify onChange={refreshOverview} /> : tab === 'places' ? <Places /> : <More onChange={refreshOverview} />}
      </Screen>
    </View>
  );
}

function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// ── Reports ─────────────────────────────────────────────────────────────────
/** The launch numbers: are people going out together, and coming back? */
function Launch() {
  const t = useTheme();
  const [m, setM] = useState<LaunchMetrics | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      fetchLaunchMetrics()
        .then(setM)
        .catch(() => setFailed(true));
    }, []),
  );
  if (failed && !m) return <EmptyState glyph="warning" title="Couldn’t load the numbers" />;
  if (!m) return <LoadingList rows={3} />;
  const pct = (v: number | null) => (v == null ? '–' : `${v}%`);
  const stats: { label: string; value: string; detail: string; tone?: 'primary' | 'trust' }[] = [
    { label: 'Nights out, last 7 days', value: String(m.nights_out_7d), detail: 'I’m Ins to events that happened this week. The number that matters most.', tone: 'primary' },
    { label: 'Out right now', value: String(m.going_out_now), detail: 'People who arrived somewhere and are still out.' },
    { label: 'New members say I’m In', value: pct(m.activation_pct), detail: `${m.activated_28d} of ${m.signups_28d} who joined in the last 4 weeks said I’m In to something in their first week.`, tone: 'trust' },
    { label: 'Still here in week 4', value: pct(m.week4_pct), detail: `${m.week4_retained} of ${m.week4_cohort} people did something in their 4th week.`, tone: 'trust' },
    { label: 'Insiders per person', value: m.avg_insiders == null ? '–' : String(m.avg_insiders), detail: 'Average. Under 3 means people feel alone here.' },
    { label: 'Events next 7 days', value: String(m.events_next_7d), detail: 'Something to say I’m In to. Keep this above 10.' },
    { label: 'Members', value: String(m.members), detail: `${m.open_reports} open report${m.open_reports === 1 ? '' : 's'}.` },
  ];
  return (
    <View style={{ gap: t.space[3] }}>
      {stats.map((s) => (
        <Card key={s.label} accent={s.tone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
            <AppText variant="h1" style={{ minWidth: 72 }}>
              {s.value}
            </AppText>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold">{s.label}</AppText>
              <AppText variant="small" tone="muted">
                {s.detail}
              </AppText>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

function Reports({ onChange }: { onChange: () => void }) {
  const t = useTheme();
  const { busy, run } = useRun();
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const load = useCallback(() => {
    fetchReports()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const act = (r: AdminReport, action: 'resolve' | 'remove' | 'restore' | 'dismiss', done: string) =>
    run(() => actOnReport(r.id, action), done).then(() => {
      load();
      onChange();
    });

  const open = (rows ?? []).filter((r) => r.status === 'open' || r.status === 'reviewing');
  const list = showClosed ? rows ?? [] : open;

  return (
    <View style={{ gap: t.space[3] }}>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Chip label={`Open (${open.length})`} selected={!showClosed} onPress={() => setShowClosed(false)} />
        <Chip label="All" selected={showClosed} onPress={() => setShowClosed(true)} />
      </View>
      {rows === null ? <LoadingList rows={2} /> : list.length === 0 ? <AppText tone="muted">Nothing waiting. Nice.</AppText> : null}
      {list.map((r) => (
        <Card key={r.id} accent={r.status === 'open' ? 'primary' : undefined}>
          <View style={{ gap: t.space[2] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
              <AppText weight="bold" style={{ flex: 1 }}>
                {r.reason} · {r.about} by {r.reported_name ?? 'deleted account'}
              </AppText>
              <AppText variant="caption" tone="subtle">
                {timeAgo(r.created_at)}
              </AppText>
            </View>
            {r.content ? (
              <AppText variant="small" style={{ fontStyle: 'italic' }}>
                “{r.content}”
              </AppText>
            ) : null}
            {r.details ? (
              <AppText variant="small" tone="muted">
                Reporter ({r.reporter_name ?? 'deleted'}): {r.details}
              </AppText>
            ) : (
              <AppText variant="caption" tone="subtle">
                Reported by {r.reporter_name ?? 'a deleted account'}
              </AppText>
            )}
            <AppText variant="caption" tone="subtle">
              {r.reports_on_target} report{r.reports_on_target === 1 ? '' : 's'} on this member in total · {r.status}
              {r.hidden ? ' · content hidden' : ''}
            </AppText>
            {r.status === 'open' || r.status === 'reviewing' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {r.pin_id || r.reply_id ? (
                  r.hidden ? (
                    <Button label="Restore" size="md" variant="secondary" onPress={() => act(r, 'restore', 'Restored')} disabled={busy} />
                  ) : (
                    <Button label="Remove content" size="md" variant="danger" onPress={() => act(r, 'remove', 'Removed')} disabled={busy} />
                  )
                ) : null}
                <Button label="Resolved" size="md" variant="secondary" onPress={() => act(r, 'resolve', 'Marked resolved')} disabled={busy} />
                <Button label="Dismiss" size="md" variant="ghost" onPress={() => act(r, 'dismiss', 'Dismissed')} disabled={busy} />
              </View>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

// ── Photo verification ──────────────────────────────────────────────────────
function Verify({ onChange }: { onChange: () => void }) {
  const t = useTheme();
  const { busy, run } = useRun();
  const [rows, setRows] = useState<AdminVerification[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const load = useCallback(() => {
    fetchVerifications()
      .then(async (r) => {
        setRows(r);
        const entries = await Promise.all(r.map(async (x) => [x.id, x.selfie_path ? await signedSelfie(x.selfie_path) : null] as const));
        setUrls(Object.fromEntries(entries.filter((e) => e[1]).map(([k, v]) => [k, v as string])));
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const review = (id: number, approve: boolean) =>
    run(() => reviewVerification(id, approve, approve ? undefined : note || 'The selfie didn’t match your profile photos, or the gesture wasn’t clear.'), approve ? 'Approved' : 'Declined').then(() => {
      setNote('');
      load();
      onChange();
    });

  return (
    <View style={{ gap: t.space[3] }}>
      {rows === null ? <LoadingList rows={2} /> : rows.length === 0 ? <AppText tone="muted">No photo checks waiting.</AppText> : null}
      {(rows ?? []).map((r) => (
        <Card key={r.id}>
          <View style={{ gap: t.space[3] }}>
            <AppText weight="bold">
              {r.display_name} · {r.vouch_count} vouches
            </AppText>
            <AppText variant="small" tone="ai">
              Asked to: {r.gesture}
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="caption" tone="subtle">
                  Selfie
                </AppText>
                {urls[r.id] ? (
                  <Image source={{ uri: urls[r.id] }} style={{ width: '100%', aspectRatio: 0.8, borderRadius: t.radius.md }} contentFit="cover" />
                ) : (
                  <Skeleton height={200} radius={t.radius.md} />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="caption" tone="subtle">
                  Profile photo
                </AppText>
                {r.avatar_url ? (
                  <Image source={{ uri: r.avatar_url }} style={{ width: '100%', aspectRatio: 0.8, borderRadius: t.radius.md }} contentFit="cover" />
                ) : (
                  <AppText variant="caption" tone="sponsored">
                    No profile photo. Decline and ask them to add one.
                  </AppText>
                )}
              </View>
            </View>
            <TextField label="Note if declining" optional value={note} onChangeText={setNote} maxLength={200} />
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="Approve" size="md" variant="trust" style={{ flex: 1 }} onPress={() => review(r.id, true)} disabled={busy} />
              <Button label="Decline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => review(r.id, false)} disabled={busy} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

// ── Venues + Featured placements ────────────────────────────────────────────
const VENUE_GLYPHS: GlyphName[] = ['dinner', 'drinks', 'wine', 'coffee', 'music', 'brunch', 'fitness', 'outdoors', 'art', 'paddle', 'pin'];
const DURATIONS = [7, 14, 30, 90];

function Places() {
  const t = useTheme();
  const { busy, run } = useRun();
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [adding, setAdding] = useState<'venue' | 'placement' | null>(null);
  // venue form
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState<GlyphName>('dinner');
  const [address, setAddress] = useState('');
  const [hood, setHood] = useState('');
  const [category, setCategory] = useState('restaurant');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // placement form
  const [venueId, setVenueId] = useState<number | null>(null);
  const [kind, setKind] = useState<'featured' | 'sponsored'>('featured');
  const [perk, setPerk] = useState('');
  const [details, setDetails] = useState('');
  const [days, setDays] = useState(30);
  const [venueQuery, setVenueQuery] = useState('');

  const load = useCallback(() => {
    Promise.all([fetchVenues(), fetchPlacements()])
      .then(([v, p]) => {
        setVenues(v);
        setPlacements(p);
      })
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  async function lookUp() {
    try {
      const hits = await Location.geocodeAsync(address);
      if (hits[0]) {
        setLat(hits[0].latitude.toFixed(5));
        setLng(hits[0].longitude.toFixed(5));
      }
    } catch {
      // Web can't look up addresses; enter the numbers or use your location.
    }
  }

  async function here() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLat(pos.coords.latitude.toFixed(5));
    setLng(pos.coords.longitude.toFixed(5));
  }

  const saveVenue = () =>
    run(
      () => addVenue({ name, glyph, address, neighborhood: hood, category, description: desc, price_level: price, lat: Number(lat), lng: Number(lng) }),
      `${name.trim()} added`,
    ).then((ok) => {
      if (!ok) return;
      setAdding(null);
      setName('');
      setAddress('');
      setHood('');
      setDesc('');
      setLat('');
      setLng('');
      load();
    });

  const savePlacement = () =>
    run(
      () =>
        addPlacement({
          venue_id: venueId as number,
          kind,
          perk: perk.trim(),
          perk_details: details.trim(),
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + days * 86_400_000).toISOString(),
        }),
      'Placement is live',
    ).then((ok) => {
      if (!ok) return;
      setAdding(null);
      setPerk('');
      setDetails('');
      setVenueId(null);
      load();
    });

  const venueName = (id: number) => venues.find((v) => v.id === id)?.name ?? `Venue ${id}`;
  const coordsOk = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lng !== '' && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  const matches = venues.filter((v) => !venueQuery.trim() || v.name.toLowerCase().includes(venueQuery.trim().toLowerCase())).slice(0, 8);
  const now = new Date().toISOString();

  return (
    <View style={{ gap: t.space[4] }}>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button label="+ Venue" size="md" variant={adding === 'venue' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setAdding(adding === 'venue' ? null : 'venue')} />
        <Button
          label="+ Featured / Sponsored"
          size="md"
          variant={adding === 'placement' ? 'primary' : 'secondary'}
          style={{ flex: 1 }}
          onPress={() => setAdding(adding === 'placement' ? null : 'placement')}
        />
      </View>

      {adding === 'venue' ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            <TextField label="Name" value={name} onChangeText={setName} maxLength={80} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {VENUE_GLYPHS.map((g) => (
                <Chip key={g} label="" glyph={g} accessibilityLabel={`Symbol ${g}`} selected={glyph === g} onPress={() => setGlyph(g)} />
              ))}
            </View>
            <TextField label="Address" value={address} onChangeText={setAddress} maxLength={160} onBlur={lookUp} />
            <TextField label="Neighborhood" value={hood} onChangeText={setHood} maxLength={60} placeholder="Logan Circle" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {['restaurant', 'bar', 'music', 'fitness', 'park', 'cafe'].map((c) => (
                <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              {[1, 2, 3, 4].map((p) => (
                <Chip key={p} label={'$'.repeat(p)} selected={price === p} onPress={() => setPrice(price === p ? null : p)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <View style={{ flex: 1 }}>
                <TextField label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="38.9150" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="-77.0319" />
              </View>
            </View>
            <AppText variant="caption" tone="subtle">
              On a phone, the address fills these in. You can also stand at the venue and use your location.
            </AppText>
            <Button label="Use my location" size="md" variant="ghost" onPress={here} />
            <TextField label="Description" optional value={desc} onChangeText={setDesc} maxLength={400} multiline />
            <Button label="Save venue" onPress={saveVenue} loading={busy} disabled={name.trim().length < 2 || !coordsOk} />
          </View>
        </Card>
      ) : null}

      {adding === 'placement' ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            <TextField label="Venue" value={venueQuery} onChangeText={setVenueQuery} placeholder="Search venues" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {matches.map((v) => (
                <Chip key={v.id} label={v.name} selected={venueId === v.id} onPress={() => setVenueId(v.id)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Chip label="Featured" selected={kind === 'featured'} onPress={() => setKind('featured')} />
              <Chip label="Sponsored (paid)" selected={kind === 'sponsored'} onPress={() => setKind('sponsored')} />
            </View>
            <TextField label="Member perk" value={perk} onChangeText={setPerk} maxLength={80} placeholder="15% off for I'm In members" />
            <TextField label="Perk details" optional value={details} onChangeText={setDetails} maxLength={400} multiline placeholder="Weeknights before 7 PM. Show your I'm In profile." />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], alignItems: 'center' }}>
              <AppText variant="caption" tone="subtle">
                Runs for
              </AppText>
              {DURATIONS.map((d) => (
                <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
              ))}
            </View>
            <Button label="Start placement" onPress={savePlacement} loading={busy} disabled={!venueId || perk.trim().length < 2} />
          </View>
        </Card>
      ) : null}

      <Section title="Placements">
        {placements.length === 0 ? <AppText tone="muted">None yet.</AppText> : null}
        {placements.map((p) => {
          const live = p.starts_at <= now && p.ends_at > now;
          return (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 48 }}>
              <Glyph name="star" size={18} tone={live ? 'sponsored' : 'subtle'} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" weight="bold">
                  {venueName(p.venue_id)} · {p.kind}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {p.perk} · {live ? 'ends' : 'ended'} {new Date(p.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </AppText>
              </View>
              {live ? <Button label="End" size="md" variant="ghost" onPress={() => run(() => endPlacement(p.id), 'Ended').then(load)} disabled={busy} /> : null}
            </View>
          );
        })}
      </Section>

      <Section title={`Venues (${venues.length})`}>
        {venues.map((v) => (
          <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 40 }}>
            <Glyph name={v.emoji ?? 'pin'} size={18} tone="muted" />
            <AppText variant="small" style={{ flex: 1 }}>
              {v.name}
              {v.neighborhood ? ` · ${v.neighborhood}` : ''}
            </AppText>
          </View>
        ))}
      </Section>
    </View>
  );
}

// ── Partners + Premium ──────────────────────────────────────────────────────
function More({ onChange }: { onChange: () => void }) {
  const t = useTheme();
  const { busy, run } = useRun();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(30);
  const load = useCallback(() => {
    fetchInquiries()
      .then(setInquiries)
      .catch(() => undefined);
    fetchUsage()
      .then(setUsage)
      .catch(() => setUsage([]));
    fetchRevenue()
      .then(setRevenue)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  return (
    <View style={{ gap: t.space[4] }}>
      <Section title="Ticket fees (what I’m In kept)">
        {revenue.length === 0 ? (
          <AppText tone="muted">No ticket sales yet.</AppText>
        ) : (
          <Card>
            <View style={{ gap: t.space[2] }}>
              {revenue.map((r) => (
                <View key={r.month} style={{ flexDirection: 'row' }}>
                  <AppText variant="small" style={{ flex: 1 }}>
                    {new Date(r.month + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </AppText>
                  <AppText variant="small" tone="muted" style={{ width: 90, textAlign: 'right' }}>
                    {r.tickets} sold
                  </AppText>
                  <AppText variant="small" weight="bold" tone="trust" style={{ width: 80, textAlign: 'right' }}>
                    {money(r.fee_cents)}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        )}
      </Section>

      <Section title="Usage (people who did it)">
        {usage === null ? (
          <LoadingList rows={2} avatar={false} />
        ) : usage.length === 0 ? (
          <AppText tone="muted">No usage yet.</AppText>
        ) : (
          <Card>
            <View style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row' }}>
                <AppText variant="caption" tone="subtle" style={{ flex: 1 }}>
                  WHAT
                </AppText>
                <AppText variant="caption" tone="subtle" style={{ width: 64, textAlign: 'right' }}>
                  7 DAYS
                </AppText>
                <AppText variant="caption" tone="subtle" style={{ width: 64, textAlign: 'right' }}>
                  30 DAYS
                </AppText>
              </View>
              {usage.map((u) => (
                <View key={u.name} style={{ flexDirection: 'row' }}>
                  <AppText variant="small" style={{ flex: 1 }}>
                    {u.name.replace(/_/g, ' ')}
                  </AppText>
                  <AppText variant="small" weight="bold" style={{ width: 64, textAlign: 'right' }}>
                    {u.people_7d}
                  </AppText>
                  <AppText variant="small" tone="muted" style={{ width: 64, textAlign: 'right' }}>
                    {u.people_30d}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        )}
      </Section>

      <Section title="Partner inquiries">
        {inquiries.length === 0 ? <AppText tone="muted">No inquiries yet.</AppText> : null}
        {inquiries.map((q) => (
          <Card key={q.id} accent={q.status === 'new' ? 'trust' : undefined}>
            <View style={{ gap: t.space[1] }}>
              <AppText weight="bold">
                {q.business_name} · {q.status}
              </AppText>
              <AppText variant="small" tone="muted">
                {q.contact_name} · {q.email}
                {q.phone ? ` · ${q.phone}` : ''}
              </AppText>
              {q.address ? (
                <AppText variant="caption" tone="subtle">
                  {q.address}
                </AppText>
              ) : null}
              {q.message ? <AppText variant="small">“{q.message}”</AppText> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], marginTop: t.space[1] }}>
                <Button label="Email" size="md" variant="secondary" onPress={() => Linking.openURL(`mailto:${q.email}?subject=I'm In partnership`)} />
                {['contacted', 'signed', 'closed'].map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={q.status === s}
                    onPress={() =>
                      run(() => setInquiryStatus(q.id, s)).then(() => {
                        load();
                        onChange();
                      })
                    }
                  />
                ))}
              </View>
            </View>
          </Card>
        ))}
      </Section>

      <Section title="Give Premium">
        <AppText variant="small" tone="muted">
          For support, partners or testing. 0 days removes it.
        </AppText>
        <TextField label="Member's email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {[0, 30, 90, 365].map((d) => (
            <Chip key={d} label={d === 0 ? 'Remove' : `${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
        <Button label="Save" size="md" onPress={() => run(() => grantPremium(email, days), days ? 'Premium given' : 'Premium removed')} loading={busy} disabled={!email.includes('@')} />
      </Section>
    </View>
  );
}
