import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import { useTheme } from '@/theme';

/** "Your First Week" popup shown after first login. */
export default function ChecklistModal() {
  const t = useTheme();
  const router = useRouter();
  const { items, dismiss } = useFirstWeekChecklist();
  const doneCount = items?.filter((i) => i.done).length ?? 0;
  const total = items?.length ?? 5;

  async function close() {
    await dismiss();
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'center', padding: t.space[5] }}>
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.xl,
          borderWidth: t.borderWidth.strong,
          borderColor: t.colors.outline,
          padding: t.space[5],
          gap: t.space[4],
          maxWidth: 440,
          width: '100%',
          alignSelf: 'center',
          boxShadow: t.shadow.raised,
        }}>
        <View style={{ gap: t.space[1] }}>
          <AppText variant="h2" accessibilityRole="header">
            Your First Week
          </AppText>
          <AppText variant="small" tone="muted">
            {doneCount} of {total} done. These get you from New Face to In the Mix fast.
          </AppText>
        </View>
        <View style={{ gap: t.space[2] }}>
          {(items ?? []).map((item) => (
            <Pressable
              key={item.key}
              disabled={item.done || !item.route}
              accessibilityRole={item.done ? 'text' : 'button'}
              accessibilityState={{ checked: item.done }}
              onPress={() => {
                dismiss();
                router.back();
                if (item.route) router.push(item.route as Href);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.surfaceAlt,
              }}>
              <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={item.done ? t.colors.trust : t.colors.textSubtle} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" style={item.done ? { color: t.colors.textMuted } : undefined}>
                  {item.label}
                </AppText>
                {item.detail ? (
                  <AppText variant="small" tone="trust">
                    {item.detail}
                  </AppText>
                ) : null}
              </View>
              {!item.done && item.route ? <Ionicons name="chevron-forward" size={18} color={t.colors.textSubtle} /> : null}
            </Pressable>
          ))}
        </View>
        <Button label="Got it" onPress={close} />
      </View>
    </View>
  );
}
