import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/in-crowd/Avatar';
import { GameIcon, type IconName } from '@/components/in-crowd/Icons';
import { GText, GameButton, IconCircle, Panel, Pill, fmtNum } from '@/components/in-crowd/Parts';
import { UI } from '@/components/in-crowd/palette';
import { OUTFITS, PlannerSprite } from '@/components/in-crowd/Sprites';
import { CLOSET, CLOSET_BY_ID, SLOTS, dressedLook, type Slot } from '@/features/in-crowd/closet';
import { PLANNERS, type PlannerId } from '@/features/in-crowd/engine/content';
import { buzz } from '@/features/in-crowd/haptics';
import { buyClosetItem, equip, setPlanner, useProgress } from '@/features/in-crowd/progress';
import { goBackOr } from '@/lib/navigation';

const SLOT_ICON: Record<Slot, IconName> = { phone: 'phone', watch: 'watch', bag: 'bag', shades: 'shades', earrings: 'earrings', necklace: 'necklace', headset: 'headset' };

/** A color dot for each item, so finishes are easy to tell apart. */
const SWATCH: Record<string, string> = {
  'phone-titanium': '#9E9A93',
  'phone-midnight': '#23262D',
  'phone-pink': '#F0BFC7',
  'phone-gold': '#E2C48E',
  'watch-midnight': '#23262D',
  'watch-starlight': '#E9E2D6',
  'watch-pink': '#F2B8C6',
  'watch-gold': '#D9B26B',
  'bag-mini': '#F4A7C0',
  'bag-quilted': '#1E1E22',
  'bag-monogram': '#6B4423',
  'bag-croc': '#F4F0E8',
  'shades-noir': '#141414',
  'shades-tortoise': '#7A4A2A',
  'shades-rose': '#E56B9A',
};

/** Dress your planner: pick who you play as, then her phone, watch, bag, shades and jewelry. */
export default function InCrowdCloset() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress } = useProgress();
  const [slot, setSlot] = useState<Slot>('bag');
  const [preview, setPreview] = useState<string | null>(null);
  const planner = progress.planner;
  const equipped = progress.closet.equipped[planner] ?? {};
  const previewItem = preview ? CLOSET_BY_ID[preview] : undefined;
  const base = dressedLook(planner, equipped);
  const look = previewItem ? previewItem.apply(previewItem.slot === 'shades' ? { ...base, acc: 'none' } : base) : base;
  const w = Math.min(width, 560);

  const pick = (id: string) => {
    buzz.select();
    const item = CLOSET_BY_ID[id];
    if (!item) return;
    if (progress.closet.owned.includes(id)) {
      setPreview(null);
      equip(item.slot, equipped[item.slot] === id ? null : id);
    } else {
      setPreview(preview === id ? null : id);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 14, alignSelf: 'center', width: w }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconCircle icon="back" label="Back" onPress={() => goBackOr(router, '/in-crowd')} />
          <GText font="display" size={34} style={{ flex: 1 }}>
            Closet
          </GText>
          <Pill>
            <GameIcon name="coin" size={20} />
            <GText font="black" size={16} color={UI.gold}>
              {fmtNum(progress.coins)}
            </GText>
          </Pill>
        </View>

        {/* Who you play as */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(Object.keys(PLANNERS) as PlannerId[]).map((id) => {
            const p = PLANNERS[id];
            const on = id === planner;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Play as ${p.name}`}
                onPress={() => {
                  buzz.select();
                  setPreview(null);
                  setPlanner(id);
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 16, backgroundColor: on ? 'rgba(255,77,141,0.18)' : UI.panel, borderWidth: 1.5, borderColor: on ? UI.pink : UI.line }}>
                <Avatar look={dressedLook(id, progress.closet.equipped[id] ?? {})} expr={on ? 'happy' : 'ok'} size={44} id={`closet-pick-${id}`} />
                <View style={{ flex: 1 }}>
                  <GText font="black" size={14}>
                    {p.name}
                  </GText>
                  <GText size={11} color={on ? UI.pink : UI.muted}>
                    {on ? 'Playing as her' : 'Tap to play as her'}
                  </GText>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* The look */}
        <Panel style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, paddingVertical: 10, backgroundColor: UI.panel2 }}>
          <Avatar look={look} expr="happy" size={Math.min(190, w * 0.44)} id="closet-look" />
          <PlannerSprite look={look} outfit={OUTFITS[planner] ?? OUTFITS.zara!} frame={0} busy scale={2} />
        </Panel>
        {previewItem ? (
          <Panel style={{ gap: 8, borderColor: UI.gold, borderWidth: 1.5 }}>
            <GText font="black" size={15}>
              Trying on: {previewItem.name}
            </GText>
            <GText size={12.5} color={UI.muted}>
              {previewItem.blurb}
            </GText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <GameButton
                label={`Buy · ${fmtNum(previewItem.price)}`}
                icon="coin"
                tone="gold"
                disabled={progress.coins < previewItem.price}
                style={{ flex: 1 }}
                onPress={() => {
                  if (buyClosetItem(previewItem.id)) {
                    buzz.success();
                    equip(previewItem.slot, previewItem.id);
                    setPreview(null);
                  }
                }}
              />
              <GameButton label="Not now" tone="dark" onPress={() => setPreview(null)} />
            </View>
            {progress.coins < previewItem.price ? (
              <GText size={11.5} color={UI.muted}>
                You need {fmtNum(previewItem.price - progress.coins)} more coins. Play a night, or get coins in the Shop.
              </GText>
            ) : null}
          </Panel>
        ) : null}

        {/* Categories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SLOTS.map(({ slot: sl, label }) => (
            <Pressable key={sl} accessibilityRole="tab" accessibilityState={{ selected: sl === slot }} onPress={() => setSlot(sl)}>
              <Pill color={sl === slot ? UI.pink : UI.panel2}>
                <GameIcon name={SLOT_ICON[sl]} size={16} />
                <GText font="black" size={12}>
                  {label}
                </GText>
              </Pill>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CLOSET.filter((i) => i.slot === slot).map((item) => {
            const owned = progress.closet.owned.includes(item.id);
            const wearing = equipped[item.slot] === item.id;
            const trying = preview === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}. ${wearing ? 'Wearing' : owned ? 'Owned, tap to wear' : `${item.price} coins, tap to try on`}`}
                onPress={() => pick(item.id)}
                style={({ pressed }) => ({
                  width: (w - 32 - 10) / 2,
                  padding: 10,
                  gap: 6,
                  borderRadius: 16,
                  backgroundColor: wearing ? 'rgba(124,242,156,0.1)' : UI.panel,
                  borderWidth: 1.5,
                  borderColor: wearing ? UI.green : trying ? UI.gold : UI.line,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: UI.panel3, alignItems: 'center', justifyContent: 'center' }}>
                    <GameIcon name={SLOT_ICON[item.slot]} size={28} />
                    {SWATCH[item.id] ? (
                      <View style={{ position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: SWATCH[item.id], borderWidth: 1.5, borderColor: '#FFFFFF' }} />
                    ) : null}
                  </View>
                  <GText font="black" size={12.5} style={{ flex: 1 }} lines={2}>
                    {item.name}
                  </GText>
                </View>
                <GText size={11} color={UI.muted} lines={2}>
                  {item.blurb}
                </GText>
                {wearing ? (
                  <GText font="black" size={11.5} color={UI.green}>
                    Wearing · tap to take off
                  </GText>
                ) : owned ? (
                  <GText font="black" size={11.5} color={UI.cyan}>
                    Owned · tap to wear
                  </GText>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <GameIcon name="coin" size={14} />
                    <GText font="black" size={12} color={UI.gold}>
                      {fmtNum(item.price)}
                    </GText>
                    <GText size={11} color={UI.muted}>
                      · tap to try on
                    </GText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <GText size={11} color={UI.subtle} align="center">
          Everything here is for your planner and shows up in every night. Coins come from playing, or from packs in the Shop.
        </GText>
      </ScrollView>
    </View>
  );
}
