import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { buzz } from '@/features/in-crowd/haptics';
import { PACKS, PASS_COIN_PRICE, type Pack, type PackId } from '@/features/in-crowd/packs';
import { MAX_PASSES, buyPassWithCoins, grantPack, passesAt, useProgress } from '@/features/in-crowd/progress';
import { buyPack, loadPrices, purchasesState } from '@/features/in-crowd/purchases';

import { GameIcon } from './Icons';
import { GText, GameButton, fmtNum } from './Parts';
import { UI } from './palette';

/** "18:42" until the next free VIP Pass. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Re-renders every second (for pass countdowns). */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** VIP Passes right now, with a live countdown to the next free one. */
export function PassesPill({ onPress }: { onPress?: () => void }) {
  const { progress } = useProgress();
  const now = useNow();
  const { passes, nextIn } = passesAt(progress, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${passes} VIP passes${nextIn ? `, next in ${fmtCountdown(nextIn)}` : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: UI.panel2, borderWidth: 1, borderColor: passes ? UI.line : UI.red }}>
      <GameIcon name="pass" size={18} />
      <GText font="black" size={14} color={passes ? UI.text : UI.red}>
        {passes}
      </GText>
      {passes < MAX_PASSES ? (
        <GText font="bold" size={11} color={UI.muted}>
          {fmtCountdown(nextIn)}
        </GText>
      ) : null}
    </Pressable>
  );
}

function PackRow({ pack, price, busy, onBuy }: { pack: Pack; price: string; busy: boolean; onBuy: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: UI.panel2, borderWidth: pack.badge ? 1.5 : 1, borderColor: pack.badge ? UI.gold : UI.line }}>
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: UI.panel3, alignItems: 'center', justifyContent: 'center' }}>
        <GameIcon name={pack.kind === 'passes' ? 'pass' : 'coin'} size={34} />
      </View>
      <View style={{ flex: 1 }}>
        <GText font="black" size={14.5}>
          {pack.kind === 'coins' ? `${fmtNum(pack.amount)} coins` : pack.name}
        </GText>
        <GText size={11.5} color={pack.badge ? UI.gold : UI.muted}>
          {pack.badge ?? (pack.kind === 'coins' ? pack.name : 'Play again right away')}
        </GText>
      </View>
      {busy ? <ActivityIndicator color={UI.gold} /> : <GameButton label={price} size="sm" tone="gold" onPress={onBuy} accessibilityLabel={`Buy ${pack.name} for ${price}`} />}
    </View>
  );
}

/**
 * VIP Pass packs and coin packs (real in-app purchases), plus a single pass
 * for coins. `only` limits it to one kind.
 */
export function PackStore({ only }: { only?: Pack['kind'] }) {
  const { progress } = useProgress();
  const [prices, setPrices] = useState<Partial<Record<PackId, string>>>({});
  const [busy, setBusy] = useState<PackId | null>(null);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const state = purchasesState();

  useEffect(() => {
    let live = true;
    loadPrices().then((p) => {
      if (live) setPrices(p);
    });
    return () => {
      live = false;
    };
  }, []);

  const buy = async (pack: Pack) => {
    setBusy(pack.id);
    setNote(null);
    const res = await buyPack(pack.id);
    setBusy(null);
    if (res.ok) {
      grantPack(pack.id, res.transactionId);
      buzz.success();
      setNote({ text: `${pack.kind === 'coins' ? `${fmtNum(pack.amount)} coins` : pack.name} added${res.test ? ' (test purchase)' : ''}.`, good: true });
    } else if (!res.cancelled) {
      buzz.warning();
      setNote({ text: res.message, good: false });
    }
  };

  const packs = PACKS.filter((p) => !only || p.kind === only);
  return (
    <View style={{ gap: 8 }}>
      {state === 'test' ? (
        <GText size={11} color={UI.gold}>
          Test purchases: this is a development build, so nothing is charged.
        </GText>
      ) : null}
      {state === 'off' ? (
        <GText size={11.5} color={UI.muted}>
          {Platform.OS === 'web' ? 'Packs are bought in the I’m In app on your phone.' : 'Packs aren’t on sale yet. VIP Passes for coins work now.'}
        </GText>
      ) : null}
      {packs.map((pack) => (
        <PackRow key={pack.id} pack={pack} price={prices[pack.id] ?? pack.fallbackPrice} busy={busy === pack.id} onBuy={() => buy(pack)} />
      ))}
      {only !== 'coins' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: UI.panel2, borderWidth: 1, borderColor: UI.line }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: UI.panel3, alignItems: 'center', justifyContent: 'center' }}>
            <GameIcon name="pass" size={34} />
          </View>
          <View style={{ flex: 1 }}>
            <GText font="black" size={14.5}>
              1 VIP Pass
            </GText>
            <GText size={11.5} color={UI.muted}>
              Paid with the coins you earn playing
            </GText>
          </View>
          <GameButton
            label={fmtNum(PASS_COIN_PRICE)}
            icon="coin"
            size="sm"
            tone={progress.coins >= PASS_COIN_PRICE ? 'gold' : 'dark'}
            disabled={progress.coins < PASS_COIN_PRICE}
            accessibilityLabel={`Buy 1 VIP Pass for ${PASS_COIN_PRICE} coins`}
            onPress={() => {
              if (buyPassWithCoins()) {
                buzz.success();
                setNote({ text: '1 VIP Pass added.', good: true });
              }
            }}
          />
        </View>
      ) : null}
      {note ? (
        <GText font="bold" size={12.5} color={note.good ? UI.green : UI.red} align="center">
          {note.text}
        </GText>
      ) : null}
    </View>
  );
}
