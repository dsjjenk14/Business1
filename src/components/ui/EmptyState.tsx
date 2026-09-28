import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { GlyphTile, type GlyphName } from './Glyph';

/** Friendly "nothing here (yet)" or "not available" message, with an optional next step. */
export function EmptyState({
  glyph = 'spark',
  title,
  body,
  action,
}: {
  glyph?: GlyphName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.space[2], paddingVertical: t.space[6], paddingHorizontal: t.space[4] }}>
      <GlyphTile name={glyph} size={52} />
      <AppText weight="bold" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" tone="muted" align="center">
          {body}
        </AppText>
      ) : null}
      {action ? <Button label={action.label} size="md" variant="secondary" onPress={action.onPress} style={{ marginTop: t.space[2] }} /> : null}
    </View>
  );
}
