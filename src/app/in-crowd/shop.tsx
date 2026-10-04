import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameIcon, type IconName } from '@/components/in-crowd/Icons';
import { GText, GameButton, IconCircle, Panel, Pill, fmtNum } from '@/components/in-crowd/Parts';
import { UI } from '@/components/in-crowd/palette';
import { PackStore, PassesPill } from '@/components/in-crowd/Store';
import { UPGRADES, UPGRADE_ORDER } from '@/features/in-crowd/engine/upgrades';
import { buzz } from '@/features/in-crowd/haptics';
import { buyUpgrade, upgradePrice, useProgress } from '@/features/in-crowd/progress';
import { goBackOr } from '@/lib/navigation';

type Tab = 'upgrades' | 'passes' | 'coins';

/** Upgrades (coins), and VIP Pass and coin packs (in-app purchases). */
export default function InCrowdShop() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress } = useProgress();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'passes' || params.tab === 'coins' ? params.tab : 'upgrades');

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 12, alignSelf: 'center', width: Math.min(width, 560) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconCircle icon="back" label="Back" onPress={() => goBackOr(router, '/in-crowd')} />
          <GText font="display" size={34} style={{ flex: 1 }}>
            The Shop
          </GText>
          <PassesPill onPress={() => setTab('passes')} />
          <Pill>
            <GameIcon name="coin" size={20} />
            <GText font="black" size={16} color={UI.gold}>
              {fmtNum(progress.coins)}
            </GText>
          </Pill>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: UI.panel, borderRadius: 14, padding: 4, gap: 4 }}>
          {(
            [
              ['upgrades', 'Upgrades'],
              ['passes', 'VIP Passes'],
              ['coins', 'Coins'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: tab === t ? UI.pink : 'transparent', alignItems: 'center' }}>
              <GText font="black" size={13}>
                {label}
              </GText>
            </Pressable>
          ))}
        </View>
        {tab === 'passes' ? (
          <>
            <GText size={13} color={UI.muted}>
              A night you don’t pass uses a VIP Pass. You hold up to 3 for free, and a new one arrives every 20 minutes. Packs add passes right away, and they stack past 3.
            </GText>
            <PackStore only="passes" />
          </>
        ) : null}
        {tab === 'coins' ? (
          <>
            <GText size={13} color={UI.muted}>
              Coins buy upgrades and Closet pieces. You earn them every night; packs are a shortcut.
            </GText>
            <PackStore only="coins" />
          </>
        ) : null}
        {tab === 'upgrades' ? (
          <GText size={13} color={UI.muted}>
            Every night pays coins (more for more stars). Upgrades last forever and work on every night, including replays.
          </GText>
        ) : null}
        {(tab === 'upgrades' ? UPGRADE_ORDER : []).map((id) => {
          const u = UPGRADES[id];
          const owned = progress.upgrades[id];
          const price = upgradePrice(progress, id);
          const maxed = price === null;
          const canBuy = !maxed && progress.coins >= (price ?? 0);
          return (
            <Panel key={id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 }}>
              <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: UI.panel2, alignItems: 'center', justifyContent: 'center' }}>
                <GameIcon name={u.icon as IconName} size={42} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <GText font="black" size={15}>
                  {u.name}
                </GText>
                <GText size={12} color={UI.muted}>
                  {u.blurb}
                </GText>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                  {u.tiers.map((_, i) => (
                    <View key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i < owned ? UI.gold : UI.panel3 }} />
                  ))}
                </View>
                <GText size={11.5} color={maxed ? UI.green : UI.text}>
                  {owned ? `Now: ${u.tiers[owned - 1]?.effect}` : 'Not owned yet'}
                  {!maxed ? `  →  ${u.tiers[owned]?.effect}` : ''}
                </GText>
              </View>
              {maxed ? (
                <Pill color="rgba(124,242,156,0.15)" border={UI.green}>
                  <GText font="black" size={12} color={UI.green}>
                    Maxed
                  </GText>
                </Pill>
              ) : (
                <GameButton
                  label={fmtNum(price ?? 0)}
                  icon="coin"
                  size="sm"
                  tone={canBuy ? 'gold' : 'dark'}
                  disabled={!canBuy}
                  accessibilityLabel={`Buy ${u.name} for ${price} coins`}
                  onPress={() => {
                    if (buyUpgrade(id)) buzz.success();
                  }}
                />
              )}
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}
