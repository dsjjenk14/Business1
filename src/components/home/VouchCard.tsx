import { View } from 'react-native';

import { AppText, Badge, Card, isGlyphName } from '@/components/ui';
import { tierProgress, useAppConfig } from '@/config/useAppConfig';
import { useTheme } from '@/theme';

/** Vouch count + tier progress ("2 more to In the Mix"). Tiers come from the config table. */
export function VouchCard({ vouchCount, onPress }: { vouchCount: number; onPress?: () => void }) {
  const t = useTheme();
  const { tiers } = useAppConfig();
  const { current, next, remaining } = tierProgress(vouchCount, tiers);
  const span = next && current ? next.min_vouches - current.min_vouches : 1;
  const progress = next && current ? (vouchCount - current.min_vouches) / span : 1;

  return (
    <Card
      accent="trust"
      onPress={onPress}
      accessibilityLabel={`${vouchCount} vouches. ${current ? `${current.name} tier.` : ''} ${next ? `${remaining} more to ${next.name}.` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
        <View style={{ alignItems: 'center', minWidth: 64 }}>
          <AppText variant="number" tone="trust" style={{ fontSize: 40, lineHeight: 44 }}>
            {vouchCount}
          </AppText>
          <AppText variant="label" tone="subtle">
            Vouches
          </AppText>
        </View>
        <View style={{ flex: 1, gap: t.space[2] }}>
          {current ? <Badge label={current.name} glyph={isGlyphName(current.emoji) ? current.emoji : 'medal'} tone="trust" /> : null}
          <AppText variant="small" tone="muted">
            {next ? `${remaining} more to ${next.name}` : 'Top tier. Legend status.'}
          </AppText>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%`, height: '100%', backgroundColor: t.colors.trust }} />
          </View>
        </View>
      </View>
    </Card>
  );
}
