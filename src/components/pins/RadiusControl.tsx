import Slider from '@react-native-community/slider';
import { View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme';

/** Radius slider, 1 mi up to the max (75 mi for everyone). */
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
  const cap = Math.min(max, planMax);
  return (
    <Card style={{ paddingVertical: t.space[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="label" tone="subtle">
          {label}
        </AppText>
        <AppText weight="bold" tone="primary">
          {value} mi
        </AppText>
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
