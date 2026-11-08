import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { StickerCircle } from './Badge';

/**
 * A big sticker slaps onto the screen for a moment ("Vouched"), then goes.
 * Usage: const [celebration, celebrate] = useCelebrate(); celebrate('Vouched', 'for Maya');
 */
export function useCelebrate() {
  const [shown, setShown] = useState<{ label: string; line: string } | null>(null);
  const celebrate = useCallback((label: string, line: string) => {
    haptic.success();
    setShown({ label, line });
  }, []);
  const element = <Celebration shown={shown} onDone={() => setShown(null)} />;
  return [element, celebrate] as const;
}

function Celebration({ shown, onDone }: { shown: { label: string; line: string } | null; onDone: () => void }) {
  const t = useTheme();
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(onDone, 1700);
    return () => clearTimeout(id);
  }, [shown, onDone]);
  if (!shown) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${shown.label} ${shown.line}. Close`} onPress={onDone} style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', gap: t.space[4] }}>
        <View style={{ transform: [{ scale: 3 }], marginVertical: t.space[9] }}>
          <StickerCircle label={shown.label} fill={t.colors.trust} ink={t.colors.onTrust} glyph="check" slap />
        </View>
        <AppText variant="h2" align="center" style={{ color: '#F5F5F5' }}>
          {shown.line}
        </AppText>
      </Pressable>
    </Modal>
  );
}
