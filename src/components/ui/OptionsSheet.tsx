import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export type SheetOption = { label: string; onPress: () => void; danger?: boolean };

/** A simple bottom sheet of choices (the "…" menu). Tap outside or Cancel to close. */
export function OptionsSheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: SheetOption[]; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="menu"
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingTop: t.space[3],
            paddingBottom: insets.bottom + t.space[3],
            paddingHorizontal: t.space[4],
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}>
          {title ? (
            <AppText variant="caption" tone="subtle" align="center" style={{ paddingBottom: t.space[2] }}>
              {title}
            </AppText>
          ) : null}
          {options.map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="menuitem"
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', opacity: pressed ? 0.6 : 1, borderBottomWidth: t.borderWidth.hairline, borderColor: t.colors.border })}>
              <AppText weight="bold" tone={o.danger ? 'danger' : 'text'} align="center">
                {o.label}
              </AppText>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <AppText tone="muted" align="center">
              Cancel
            </AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
