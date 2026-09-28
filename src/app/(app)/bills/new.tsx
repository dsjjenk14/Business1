import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Switch, TextInput, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Chip, LoadingList, Screen, Segmented, TextField, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { createBill, evenShares, fetchBillPeople, money, parseMoney, type BillPerson } from '@/features/bills/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme, fontStyle } from '@/theme';

const TIPS = [0, 15, 18, 20, 22];

/**
 * Split the bill: snap the receipt, enter the total, tag who was there, and
 * split evenly or type each person's amount. Each friend is told their share.
 */
export default function NewBill() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ event?: string; title?: string }>();
  const eventId = params.event ? Number(params.event) : null;

  const [title, setTitle] = useState(params.title ? `${params.title}` : '');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [totalText, setTotalText] = useState('');
  const [tipPct, setTipPct] = useState(0);
  const [people, setPeople] = useState<BillPerson[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [split, setSplit] = useState<'even' | 'custom'>('even');
  const [includeMe, setIncludeMe] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchBillPeople(eventId)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [eventId]);

  const total = parseMoney(totalText) ?? 0;
  const tip = Math.round((total * tipPct) / 100);
  const grand = total + tip;
  const names = useMemo(() => Object.fromEntries((people ?? []).map((p) => [p.user_id, p])), [people]);

  const even = evenShares(grand, picked, includeMe);
  const custom = picked.map((id) => ({ user_id: id, amount_cents: parseMoney(amounts[id] ?? '') ?? 0 }));
  const shares = split === 'even' ? even.shares : custom;
  const owedSum = shares.reduce((a, s) => a + s.amount_cents, 0);
  const myShare = grand - owedSum;
  const problem = !title.trim()
    ? 'Give it a name, like “Dinner”.'
    : !total
      ? 'Enter the total from the receipt.'
      : !picked.length
        ? 'Tag at least one friend.'
        : shares.some((s) => s.amount_cents < 1)
          ? 'Every friend needs an amount.'
          : myShare < 0
            ? `That’s ${money(-myShare)} more than the bill.`
            : null;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function pickReceipt(fromCamera: boolean) {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return toast('Allow the camera to snap the receipt.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) setReceipt(result.assets[0].uri);
    } catch {
      toast('Couldn’t open that photo.');
    }
  }

  async function send() {
    if (!session || problem) return;
    setBusy(true);
    try {
      const id = await createBill({
        userId: session.user.id,
        title,
        totalCents: total,
        tipCents: tip,
        split,
        shares,
        receiptUri: receipt,
        eventId,
      });
      track('bill_sent', { people: picked.length, split, receipt: !!receipt, event: !!eventId });
      toast(`Sent to ${picked.length} ${picked.length === 1 ? 'friend' : 'friends'}`);
      router.replace({ pathname: '/bills/[id]', params: { id: String(id) } });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Split the bill" />
      <Screen>
        <TextField label="What for" value={title} onChangeText={setTitle} maxLength={80} placeholder="Dinner at Rosa’s" />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="muted">
            Receipt
          </AppText>
          {receipt ? (
            <View style={{ gap: t.space[2] }}>
              <Image
                source={{ uri: receipt }}
                style={{ width: '100%', height: 260, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}
                contentFit="contain"
                accessibilityLabel="Your receipt photo"
              />
              <Button label="Remove photo" variant="ghost" size="md" onPress={() => setReceipt(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button
                label="Snap receipt"
                variant="secondary"
                size="md"
                style={{ flex: 1 }}
                onPress={() => pickReceipt(true)}
                icon={<Ionicons name="camera-outline" size={18} color={t.colors.text} />}
              />
              <Button
                label="From photos"
                variant="secondary"
                size="md"
                style={{ flex: 1 }}
                onPress={() => pickReceipt(false)}
                icon={<Ionicons name="image-outline" size={18} color={t.colors.text} />}
              />
            </View>
          )}
          <AppText variant="caption" tone="subtle">
            Only the people on this bill can see it.
          </AppText>
        </View>

        <TextField
          label="Total on the receipt (with tax)"
          value={totalText}
          onChangeText={setTotalText}
          keyboardType="decimal-pad"
          placeholder="$0.00"
          hint={totalText && !parseMoney(totalText) ? 'Enter an amount like 84.50' : undefined}
        />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="muted">
            Tip
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {TIPS.map((p) => (
              <Chip key={p} label={p ? `${p}%` : 'Already in'} selected={tipPct === p} onPress={() => setTipPct(p)} />
            ))}
          </View>
          {total ? (
            <AppText variant="small" weight="bold">
              Bill total: {money(grand)}
              {tip ? ` (${money(tip)} tip)` : ''}
            </AppText>
          ) : null}
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="label" tone="muted">
            Who was there
          </AppText>
          {!people ? (
            <LoadingList rows={3} />
          ) : people.length === 0 ? (
            <AppText variant="small" tone="muted">
              No one to tag yet. You can split with people in your circle{eventId ? ' or people at this event' : ''}.
            </AppText>
          ) : (
            people.map((p) => {
              const on = picked.includes(p.user_id);
              return (
                <Pressable
                  key={p.user_id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  accessibilityLabel={p.display_name}
                  onPress={() => toggle(p.user_id)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
                  <Avatar name={p.display_name} uri={p.avatar_url} size={38} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{p.display_name}</AppText>
                    <AppText variant="caption" tone="subtle">
                      {p.at_event ? 'At this event' : 'Your circle'}
                    </AppText>
                  </View>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? t.colors.primary : t.colors.textSubtle} />
                </Pressable>
              );
            })
          )}
        </View>

        {picked.length ? (
          <View style={{ gap: t.space[3] }}>
            <Segmented
              options={[
                { key: 'even', label: 'Split evenly' },
                { key: 'custom', label: 'Enter amounts' },
              ]}
              value={split}
              onChange={setSplit}
            />
            {split === 'even' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">Include me</AppText>
                  <AppText variant="caption" tone="muted">
                    Turn off if you&apos;re treating yourself out of the split.
                  </AppText>
                </View>
                <Switch value={includeMe} onValueChange={setIncludeMe} accessibilityLabel="Include me in the even split" />
              </View>
            ) : null}
            {shares.map((s) => {
              const p = names[s.user_id];
              return (
                <View key={s.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                  <Avatar name={p?.display_name ?? '?'} uri={p?.avatar_url ?? null} size={32} />
                  <AppText style={{ flex: 1 }} numberOfLines={1}>
                    {p?.display_name}
                  </AppText>
                  {split === 'even' ? (
                    <AppText weight="bold">{money(s.amount_cents)}</AppText>
                  ) : (
                    <TextInput
                      value={amounts[s.user_id] ?? ''}
                      onChangeText={(v) => setAmounts((a) => ({ ...a, [s.user_id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="$0.00"
                      placeholderTextColor={t.colors.textSubtle}
                      accessibilityLabel={`Amount for ${p?.display_name}`}
                      style={{
                        width: 110,
                        textAlign: 'right',
                        color: t.colors.text,
                        ...fontStyle(t.fonts.bodyBold),
                        fontSize: 16,
                        paddingHorizontal: t.space[3],
                        paddingVertical: t.space[2],
                        borderRadius: t.radius.md,
                        borderWidth: t.borderWidth.regular,
                        borderColor: t.colors.border,
                        backgroundColor: t.colors.surface,
                      }}
                    />
                  )}
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: t.borderWidth.hairline, borderColor: t.colors.border, paddingTop: t.space[2] }}>
              <AppText tone="muted">Your share</AppText>
              <AppText weight="bold" tone={myShare < 0 ? 'danger' : undefined}>
                {money(Math.max(myShare, 0))}
              </AppText>
            </View>
          </View>
        ) : null}

        {problem && (total || picked.length) ? (
          <AppText variant="small" tone="danger">
            {problem}
          </AppText>
        ) : null}
        <Button label={picked.length ? `Send to ${picked.length}` : 'Send'} onPress={send} loading={busy} disabled={!!problem} />
        <AppText variant="caption" tone="subtle">
          I&apos;m In doesn&apos;t move money. Friends pay you with Venmo, Cash App or PayPal (no fees from us) and tap &quot;I paid&quot;. Add your usernames in Split
          the bill → Where friends pay you.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
