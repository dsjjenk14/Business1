import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, View } from 'react-native';

import { AppText, Button, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { aDrink } from '@/features/drinks/words';
import { fetchDrinkMenu, fetchWallet, sendDrink, usd, type DrinkItem } from '@/features/drinks/api';
import { useTheme } from '@/theme';

import { DrinkIcon } from './DrinkIcon';

/**
 * The drink menu: pick a cocktail to send to whoever is live. It's paid from
 * your drink credit; they get most of it as real money.
 */
export function DrinkMenu({
  visible,
  onClose,
  hostName,
  to,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  hostName: string;
  to: { liveId?: number; eventId?: number };
  onSent?: (drink: string, name: string) => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [menu, setMenu] = useState<DrinkItem[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    Promise.all([fetchDrinkMenu(), fetchWallet()])
      .then(([m, w]) => {
        if (cancelled) return;
        setMenu(m);
        setBalance(w.balance_cents);
      })
      .catch(() => !cancelled && setMenu([]));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  async function send(d: DrinkItem) {
    if (balance != null && balance < d.cents) {
      toast(`Add drink credit to send ${aDrink(d.name)}.`);
      return;
    }
    setSending(d.key);
    try {
      const r = await sendDrink(d.key, to, anonymous);
      setBalance(r.balance_cents);
      track('drink_sent', { drink: d.key, cents: d.cents, live: !!to.liveId, event: !!to.eventId, anonymous });
      onSent?.(d.key, d.name);
      toast(`You sent ${hostName.split(' ')[0]} ${aDrink(d.name)}${anonymous ? ' anonymously' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t send that drink.');
    } finally {
      setSending(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close the drink menu" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View style={{ backgroundColor: t.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: t.space[4], gap: t.space[3], maxHeight: '80%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="h2">Send {hostName.split(' ')[0]} a drink</AppText>
            <AppText variant="small" tone="muted">
              They get real money for every drink. {balance != null ? `Your credit: ${usd(balance)}` : ''}
            </AppText>
          </View>
          <Button
            label="Add credit"
            size="md"
            variant="secondary"
            onPress={() => {
              onClose();
              router.push('/settings/wallet');
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Send anonymously</AppText>
            <AppText variant="caption" tone="muted">
              {hostName.split(' ')[0]} and everyone watching see &quot;Someone&quot; instead of your name.
            </AppText>
          </View>
          <Switch value={anonymous} onValueChange={setAnonymous} accessibilityLabel="Send anonymously" trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }} />
        </View>
        {!menu ? (
          <ActivityIndicator color={t.colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], paddingBottom: t.space[4] }}>
            {menu.map((d) => {
              const short = balance != null && balance < d.cents;
              return (
                <Pressable
                  key={d.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${aDrink(d.name)}, ${usd(d.cents)}`}
                  onPress={() => send(d)}
                  disabled={!!sending}
                  style={({ pressed }) => ({
                    width: '23.5%',
                    minWidth: 76,
                    flexGrow: 1,
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: t.space[3],
                    borderRadius: t.radius.md,
                    backgroundColor: '#17161A',
                    opacity: pressed || short ? 0.6 : 1,
                  })}>
                  {sending === d.key ? <ActivityIndicator color="#FFFFFF" style={{ height: 52 }} /> : <DrinkIcon drink={d.key} size={52} />}
                  <AppText variant="caption" weight="bold" align="center" style={{ color: '#FFFFFF' }} numberOfLines={1}>
                    {d.name}
                  </AppText>
                  <AppText variant="caption" style={{ color: '#FFD60A' }}>
                    {usd(d.cents)}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
