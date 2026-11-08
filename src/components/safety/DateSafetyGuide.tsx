import { Modal, ScrollView, View } from 'react-native';

import { AppText, Button, GlyphTitle, type GlyphName } from '@/components/ui';
import { useTheme } from '@/theme';

const TIPS: { glyph: GlyphName; title: string; body: string }[] = [
  { glyph: 'pin', title: 'Meet somewhere public', body: 'Pick a busy spot for the first time, and get there on your own.' },
  { glyph: 'people', title: 'Tell a friend', body: 'Add trusted contacts in Safety, so help is one tap away.' },
  { glyph: 'clock', title: 'Check in when asked', body: 'Date Mode asks if you’re okay on a timer. Miss one and you get an alert with one-tap help.' },
  { glyph: 'exit', title: 'Leave anytime', body: '“I need help” and “I need to leave now” are always on this screen. No reason needed.' },
];

/** Shown the first time someone turns on Date Mode. */
export function DateSafetyGuide({ visible, onDone, onClose }: { visible: boolean; onDone: () => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: t.space[4] }}>
        <View style={{ backgroundColor: t.colors.bg, borderRadius: t.radius.lg, maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <ScrollView contentContainerStyle={{ padding: t.space[5], gap: t.space[4] }}>
            <AppText variant="h2" accessibilityRole="header">
              Before your first date
            </AppText>
            {TIPS.map((tip) => (
              <View key={tip.title} style={{ gap: 2 }}>
                <GlyphTitle glyph={tip.glyph}>{tip.title}</GlyphTitle>
                <AppText variant="small" tone="muted">
                  {tip.body}
                </AppText>
              </View>
            ))}
            <AppText variant="small" tone="muted">
              In danger? Call 911.
            </AppText>
            <Button label="Got it, start Date Mode" variant="trust" onPress={onDone} />
            <Button label="Not now" variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
