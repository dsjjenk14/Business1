import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { THEME_ORDER, THEMES, useThemeContext, type ThemeId } from '@/theme';

/** Theme picker. Every theme is built from the same tokens, so the whole app changes at once. */
export default function Appearance() {
  const { theme: t, setThemeId } = useThemeContext();
  const { session } = useAuth();

  function choose(id: ThemeId) {
    setThemeId(id);
    if (session) supabase.from('user_settings').update({ theme_id: id }).eq('user_id', session.user.id).then(() => {});
  }

  return (
    <>
      <BackHeader title="Appearance" />
      <Screen contentGap={t.space[3]}>
        <AppText tone="muted">Pick a look. You can switch any time.</AppText>
        {THEME_ORDER.map((id) => {
          const option = THEMES[id];
          const selected = id === t.id;
          const c = option.colors;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.name}: ${option.tagline}`}
              onPress={() => choose(id)}
              style={{
                borderRadius: t.radius.lg,
                borderWidth: selected ? 3 : t.borderWidth.regular,
                borderColor: selected ? t.colors.primary : t.colors.border,
                overflow: 'hidden',
              }}>
              <View style={{ backgroundColor: c.bg, padding: t.space[4], gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontFamily: option.fonts.displayBold, fontSize: 20, lineHeight: 26, color: c.text }}>
                      {option.id === 'E' ? '★ ' : ''}
                      {option.name}
                    </AppText>
                    <AppText variant="small" style={{ color: c.textMuted, fontFamily: option.fonts.body }}>
                      {option.tagline}
                    </AppText>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={26} color={c.primary} /> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  {[c.primary, c.secondary, c.trust, c.ai, c.surface].map((swatch, i) => (
                    <View
                      key={i}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: option.style.badge === 'sticker' ? 6 : 16,
                        backgroundColor: swatch,
                        borderWidth: option.borderWidth.regular,
                        borderColor: option.colors.outline,
                      }}
                    />
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </Screen>
    </>
  );
}
