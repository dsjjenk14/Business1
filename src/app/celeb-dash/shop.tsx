import { useRouter } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameIcon, type IconName } from '@/components/celeb-dash/Icons';
import { GText, GameButton, IconCircle, Panel, Pill, fmtNum } from '@/components/celeb-dash/Parts';
import { UI } from '@/components/celeb-dash/palette';
import { UPGRADES, UPGRADE_ORDER } from '@/features/celeb-dash/engine/upgrades';
import { buzz } from '@/features/celeb-dash/haptics';
import { buyUpgrade, upgradePrice, useProgress } from '@/features/celeb-dash/progress';
import { goBackOr } from '@/lib/navigation';

/** Spend coins on upgrades that make every night easier. */
export default function CelebDashShop() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress } = useProgress();

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 12, alignSelf: 'center', width: Math.min(width, 560) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconCircle icon="back" label="Back" onPress={() => goBackOr(router, '/celeb-dash')} />
          <GText font="display" size={34} style={{ flex: 1 }}>
            The Shop
          </GText>
          <Pill>
            <GameIcon name="coin" size={20} />
            <GText font="black" size={16} color={UI.gold}>
              {fmtNum(progress.coins)}
            </GText>
          </Pill>
        </View>
        <GText size={13} color={UI.muted}>
          Every night pays coins (more for more stars). Upgrades last forever and work on every night, including replays.
        </GText>
        {UPGRADE_ORDER.map((id) => {
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
