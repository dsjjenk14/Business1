import Ionicons from '@expo/vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme';

/** Radius: a small "Within 75 mi" button that opens a slider (1 mi up to 75 mi for everyone). */
export function RadiusControl({
  label,
  value,
  onChange,
  onCommit,
  min = 1,
  max,
  planMax,
  premiumMax,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  min?: number;
  max: number;
  planMax: number;
  premiumMax: number | null;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const ticket = t.style.controls === 'ticket';
  const cap = Math.min(max, planMax);
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: within ${value} miles. Change`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: 36,
          paddingHorizontal: t.space[3],
          borderRadius: ticket ? t.radius.sm : t.radius.pill,
          borderWidth: ticket ? 0 : t.borderWidth.hairline,
          borderColor: t.colors.border,
          backgroundColor: ticket ? t.colors.surfaceAlt : t.colors.surface,
          opacity: pressed ? 0.7 : 1,
        })}>
        <Ionicons name="locate-outline" size={16} color={t.colors.primaryText} />
        {ticket ? (
          <AppText style={{ fontFamily: t.fonts.mono, fontSize: 11.5, lineHeight: 15, letterSpacing: 0.6, textTransform: 'uppercase', color: t.colors.text }}>
            {`Within ${value} mi`}
          </AppText>
        ) : (
          <AppText variant="small" weight="bold">
            Within {value} mi
          </AppText>
        )}
        <Ionicons name="chevron-down" size={14} color={t.colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <Card style={{ paddingVertical: t.space[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="label" tone="subtle">
          {label}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Done: ${value} miles`} onPress={() => setOpen(false)} hitSlop={8}>
          <AppText weight="bold" tone="primary">
            {value} mi · Done
          </AppText>
        </Pressable>
      </View>
      <Slider
        accessibilityLabel={`${label}, ${value} miles`}
        accessibilityValue={{ min, max: cap, now: value, text: `${value} miles` }}
        aria-valuemin={min}
        aria-valuemax={cap}
        aria-valuenow={value}
        minimumValue={min}
        maximumValue={cap}
        step={1}
        value={Math.min(value, cap)}
        onValueChange={(v) => onChange(Math.round(v))}
        onSlidingComplete={(v) => onCommit?.(Math.round(v))}
        minimumTrackTintColor={t.colors.primary}
        maximumTrackTintColor={t.colors.surfaceAlt}
        thumbTintColor={t.colors.primary}
        style={{ height: 36 }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" tone="subtle">
          {min} mi
        </AppText>
        <AppText variant="caption" tone={cap < max ? 'sponsored' : 'subtle'}>
          {cap < max && premiumMax ? `${cap} mi · Premium goes to ${Math.min(max, premiumMax)} mi` : `${cap} mi`}
        </AppText>
      </View>
    </Card>
  );
}
