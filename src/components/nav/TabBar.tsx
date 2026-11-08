import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';

import { AppText, Glyph, type GlyphName } from '@/components/ui';
import { useNewOuts } from '@/features/outs/useNewOuts';
import { haptic } from '@/lib/haptics';
import { useTheme, fontStyle } from '@/theme';

// The app's own drawn icons (Glyph), not a stock icon set.
const TABS: Record<string, { label: string; glyph: GlyphName }> = {
  index: { label: 'Home', glyph: 'home' },
  pins: { label: 'Pins', glyph: 'pin' },
  outs: { label: 'Outs', glyph: 'camera' },
  tonight: { label: 'Tonight', glyph: 'moon' },
  circles: { label: 'Insiders', glyph: 'people' },
};

/** The tab bar: Home, Pins, Outs (in the middle, the main button), Tonight, Circles. */
export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const outsNew = useNewOuts();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.tabBar,
        borderTopWidth: t.borderWidth.hairline,
        borderColor: t.colors.border,
        paddingTop: t.space[2],
        paddingBottom: Math.max(insets.bottom, t.space[2]),
        paddingHorizontal: t.space[2],
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? t.colors.tabActive : t.colors.tabInactive;
        const ticket = t.style.controls === 'ticket';
        // Mix look: the camera is a big red rounded square that rises out of the bar.
        const squircle = t.style.avatarShape === 'squircle';
        const raised = ticket || squircle;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={route.name === 'outs' && outsNew ? `${tab.label}, ${outsNew} new` : tab.label}
            onPress={() => {
              if (!focused) haptic.select();
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                alignItems: 'center',
                gap: 2,
                paddingHorizontal: t.space[3],
                paddingVertical: 4,
                minWidth: 56,
              }}>
              {route.name === 'outs' ? (
                <View
                  style={{
                    width: squircle ? 52 : 44,
                    height: squircle ? 52 : ticket ? 44 : 30,
                    borderRadius: squircle ? 18 : ticket ? 22 : 15,
                    // The shutter rises above the bar; its label lines up with the others.
                    marginTop: squircle ? -26 : ticket ? -22 : 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: raised || focused ? t.colors.primary : t.colors.surfaceAlt,
                    // Ticket look: a camera shutter, with an inner ring.
                    borderWidth: raised ? 3 : 0,
                    borderColor: focused ? t.colors.text : t.colors.tabBar,
                  }}>
                  <Glyph name={tab.glyph} size={squircle ? 26 : 22} strokeWidth={2.2} color={raised || focused ? t.colors.onPrimary : t.colors.primaryText} />
                  {outsNew ? (
                    <View
                      accessibilityLabel={`${outsNew} new`}
                      style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: t.colors.primary, borderWidth: 2, borderColor: t.colors.tabBar }}
                    />
                  ) : null}
                </View>
              ) : (
                <Glyph name={tab.glyph} size={24} strokeWidth={focused ? 2.4 : 1.7} color={color} />
              )}
              {ticket ? (
                <AppText style={{ color, ...fontStyle(t.fonts.bodyMedium), fontSize: 10.5, lineHeight: 13 }}>{tab.label}</AppText>
              ) : (
                <AppText variant="caption" weight="bold" style={{ color }}>
                  {tab.label}
                </AppText>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
