import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { VenuePicker, type PlaceChoice } from '@/components/tonight/VenuePicker';
import { AppText, Button, Card, GlyphTitle, LoadingDetail, Screen, TextField, useToast } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { openPayment } from '@/features/payments/api';
import { claimPlace, fetchMyPlaceClaim, type PlaceClaim } from '@/features/places/specials';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Claim your place: a business signs up, we check it's theirs, then they start
 * their partnership ($49/month, with free months for the first places) and post
 * specials themselves.
 */
export default function ClaimPlace() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { settings } = useAppConfig();
  const { paid } = useLocalSearchParams<{ paid?: string }>();
  const price = Math.round(Number(settings.place_price_cents ?? 4900) / 100);
  const [claim, setClaim] = useState<PlaceClaim | null | undefined>(undefined);
  const [place, setPlace] = useState<PlaceChoice>({ venueId: null, text: '' });
  const [business, setBusiness] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [perk, setPerk] = useState('');
  const [perkDetails, setPerkDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchMyPlaceClaim()
      .then(setClaim)
      .catch(() => setClaim(null));
  }, []);
  useFocusEffect(load);

  async function submit() {
    setBusy(true);
    try {
      await claimPlace({ venueId: place.venueId, business: business || place.text, address, contact, phone, perk, perkDetails });
      toast('Got it. We’ll check it’s your place, usually within a day.');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    try {
      await openPayment('place_subscribe');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const header = <BackHeader title="Claim your place" />;
  if (claim === undefined)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <Screen>
          <LoadingDetail />
        </Screen>
      </View>
    );

  if (claim && claim.status !== 'rejected' && claim.status !== 'canceled') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <Screen>
          <Card accent={claim.status === 'active' ? 'trust' : 'primary'}>
            <View style={{ gap: t.space[2] }}>
              <GlyphTitle glyph={claim.status === 'active' ? 'check' : 'clock'} tone={claim.status === 'active' ? 'trust' : 'primary'}>
                {claim.status === 'pending'
                  ? `Checking ${claim.business_name}`
                  : claim.status === 'approved'
                    ? `${claim.business_name} is approved`
                    : `${claim.business_name} is live`}
              </GlyphTitle>
              <AppText variant="small" tone="muted">
                {claim.status === 'pending'
                  ? 'We make sure every place is claimed by its real owner. You’ll get a notification, usually within a day.'
                  : claim.status === 'approved'
                    ? claim.free_months > 0
                      ? `You’re one of our first places, so your first ${claim.free_months} months are free. Add a card now; you’re not charged until they end, and you can cancel anytime.`
                      : `Start your partnership for $${price} a month. Cancel anytime.`
                    : 'Members see your perk and the Featured label. Post tonight’s special from your page every day.'}
              </AppText>
              {claim.status === 'approved' ? (
                <Button label={claim.free_months > 0 ? `Start my ${claim.free_months} free months` : `Start for $${price}/month`} onPress={start} loading={busy} />
              ) : null}
              {claim.status === 'active' && claim.venue_id ? (
                <Button label="Go to my place" variant="secondary" onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(claim.venue_id) } })} />
              ) : null}
              {paid && claim.status === 'approved' ? (
                <AppText variant="caption" tone="subtle">
                  Finishing up with Stripe… this page updates in a moment.
                </AppText>
              ) : null}
            </View>
          </Card>
        </Screen>
      </View>
    );
  }

  const ready = (place.venueId || business.trim().length >= 2) && contact.trim().length >= 2 && perk.trim().length >= 2;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <Screen>
        <Card accent="sponsored">
          <View style={{ gap: t.space[2] }}>
            <GlyphTitle glyph="star" tone="sponsored">
              Get your place in front of DC
            </GlyphTitle>
            <AppText variant="small" tone="muted">
              {`Partners get a Featured label, a member perk on their page, and a special every day on What's In. $${price} a month, and our first ${String(settings.place_free_spots ?? 10)} places get ${String(settings.place_free_months ?? 3)} months free. Members' information is never shared with you.`}
            </AppText>
          </View>
        </Card>
        {claim?.status === 'rejected' ? (
          <AppText variant="small" tone="danger">
            We couldn&apos;t confirm your last claim. Check the details and try again, or contact support.
          </AppText>
        ) : null}
        <VenuePicker label="Your place" value={place} onChange={setPlace} />
        {!place.venueId ? (
          <>
            <TextField label="Business name" value={business} onChangeText={setBusiness} maxLength={80} placeholder="Founding Farmers" />
            <TextField label="Address" value={address} onChangeText={setAddress} maxLength={200} placeholder="1800 Tysons Blvd" />
          </>
        ) : null}
        <TextField label="Your name" value={contact} onChangeText={setContact} maxLength={80} />
        <TextField label="Phone at the business" optional value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" hint="We may call to confirm it’s your place." />
        <TextField label="Perk for I’m In members" value={perk} onChangeText={setPerk} maxLength={80} placeholder="15% off for I’m In members" />
        <TextField label="Perk details" optional value={perkDetails} onChangeText={setPerkDetails} maxLength={400} multiline placeholder="Weeknights before 7. Show your I’m In profile." />
        <Button label="Claim my place" onPress={submit} loading={busy} disabled={!ready} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
