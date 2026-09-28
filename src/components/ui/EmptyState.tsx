import { View } from 'react-native';

import { useTheme, fontStyle } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Glyph, GlyphTile, type GlyphName } from './Glyph';
import { look } from './look';

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
  const { poster } = look(t);
  return (
    <View style={{ alignItems: 'center', gap: t.space[2], paddingVertical: t.space[6], paddingHorizontal: t.space[4] }}>
      {poster ? <Glyph name={glyph} size={40} tone="primary" strokeWidth={1.6} /> : <GlyphTile name={glyph} size={52} />}
      {poster ? (
        <AppText align="center" accessibilityRole="header" style={{ ...fontStyle(t.fonts.display), fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: t.colors.text, marginTop: t.space[1] }}>
          {title}
        </AppText>
      ) : (
        <AppText weight="bold" align="center" accessibilityRole="header">
          {title}
        </AppText>
      )}
      {body ? (
        <AppText variant="small" tone="muted" align="center">
          {body}
        </AppText>
      ) : null}
      {action ? <Button label={action.label} size="md" variant="secondary" onPress={action.onPress} style={{ marginTop: t.space[2] }} /> : null}
    </View>
  );
}
