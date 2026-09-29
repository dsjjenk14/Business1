import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { PeoplePicker } from '@/components/chat/PeoplePicker';
import { AppText, Button } from '@/components/ui';
import type { ChatCandidate } from '@/features/chat/api';
import { OUT_HOURS, type OutHours } from '@/features/outs/api';
import { fontStyle, useTheme } from '@/theme';

/**
 * An Out's settings, one tap away from the send screen: how long it lasts
 * (6, 12 or 24 hours, shown as a clock filling up) and who it's hidden from.
 */
export function OutSettingsSheet({
  visible,
  onClose,
  hours,
  onHours,
  people,
  hidden,
  onToggleHidden,
}: {
  visible: boolean;
  onClose: () => void;
  hours: OutHours;
  onHours: (h: OutHours) => void;
  people: ChatCandidate[];
  hidden: Set<string>;
  onToggleHidden: (id: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close Out settings" onPress={onClose} style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingTop: t.space[2],
            paddingBottom: insets.bottom + t.space[3],
            width: '100%',
            maxWidth: 640,
            maxHeight: '88%',
            alignSelf: 'center',
          }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.borderStrong, marginBottom: t.space[3] }} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: t.space[4], gap: t.space[5], paddingBottom: t.space[3] }}>
            <View style={{ gap: t.space[3] }}>
              <AppText variant="h3" accessibilityRole="header">
                How long it lasts
              </AppText>
              <View style={{ flexDirection: 'row', gap: t.space[3] }} accessibilityRole="radiogroup">
                {OUT_HOURS.map((h) => (
                  <HourCard key={h} hours={h} selected={hours === h} onPress={() => onHours(h)} />
                ))}
              </View>
              <AppText variant="caption" tone="muted">
                After {hours} hours it&apos;s gone, unless someone pins it.
              </AppText>
            </View>

            <View style={{ gap: t.space[2] }}>
              <AppText variant="h3" accessibilityRole="header">
                Hide from
              </AppText>
              <AppText variant="caption" tone="muted">
                {hidden.size
                  ? `${hidden.size} ${hidden.size === 1 ? 'person' : 'people'} won't see this Out, even on your Out. They aren't told.`
                  : "Pick anyone who shouldn't see this Out. They aren't told."}
              </AppText>
              {people.length ? (
                <PeoplePicker people={people} selected={hidden} onToggle={onToggleHidden} />
              ) : (
                <AppText variant="small" tone="muted">
                  No one to hide from yet.
                </AppText>
              )}
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: t.space[4] }}>
            <Button label="Done" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A card with a clock ring filled to the share of a day the Out lasts. */
function HourCard({ hours, selected, onPress }: { hours: OutHours; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const size = 56;
  const r = 24;
  const c = size / 2;
  const share = hours / 24;
  // The filled wedge: from 12 o'clock, clockwise.
  const angle = share * 2 * Math.PI;
  const x = c + r * Math.sin(angle);
  const y = c - r * Math.cos(angle);
  const wedge = share >= 1 ? null : `M${c} ${c} L${c} ${c - r} A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  const fill = selected ? t.colors.primary : t.colors.textSubtle;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${hours} hours`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: t.space[2],
        paddingVertical: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: 2,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.surfaceAlt : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} fill="none" stroke={t.colors.border} strokeWidth={2} />
        {wedge ? <Path d={wedge} fill={fill} opacity={0.85} /> : <Circle cx={c} cy={c} r={r} fill={fill} opacity={0.85} />}
        <Circle cx={c} cy={c} r={2.5} fill={t.colors.text} />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <AppText style={{ ...fontStyle(t.fonts.displayBold), fontSize: 26, lineHeight: 28 }}>{hours}</AppText>
        <AppText variant="caption" tone={selected ? 'text' : 'muted'} weight={selected ? 'bold' : undefined}>
          hours
        </AppText>
      </View>
    </Pressable>
  );
}
