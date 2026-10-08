import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';

import { AppText, type IconName } from '@/components/ui';
import { useNewOuts } from '@/features/outs/useNewOuts';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  pins: { label: 'Pins', icon: 'pin-outline', iconActive: 'pin' },
  outs: { label: 'Outs', icon: 'camera-outline', iconActive: 'camera' },
  tonight: { label: 'Tonight', icon: 'moon-outline', iconActive: 'moon' },
  circles: { label: 'Insiders', icon: 'people-circle-outline', iconActive: 'people-circle' },
};

/** The tab bar: Home, Pins, Outs (in the middle, the main button), Tonight, Circles. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
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
        paddingBottom: Math.max(insets.bottom, t.space[3]),
        paddingHorizontal: t.space[2],
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? t.colors.tabActive : t.colors.tabInactive;
        const ticket = t.style.controls === 'ticket';

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={route.name === 'outs' && outsNew ? `${tab.label}, ${outsNew} new` : tab.label}
            onPress={() => {
              if (!focused) haptic.select();
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
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
                    width: 44,
                    height: ticket ? 44 : 30,
                    borderRadius: ticket ? 22 : 15,
                    // The shutter sits a little above the bar.
                    marginTop: ticket ? -12 : 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ticket || focused ? t.colors.primary : t.colors.surfaceAlt,
                    // Ticket look: a camera shutter, with an inner ring.
                    borderWidth: ticket ? 3 : 0,
                    borderColor: focused ? t.colors.text : t.colors.tabBar,
                  }}>
                  <Ionicons name={tab.iconActive} size={20} color={ticket || focused ? t.colors.onPrimary : t.colors.primaryText} />
                  {outsNew ? (
                    <View
                      accessibilityLabel={`${outsNew} new`}
                      style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: t.colors.primary, borderWidth: 2, borderColor: t.colors.tabBar }}
                    />
                  ) : null}
                </View>
              ) : (
                <Ionicons name={focused ? tab.iconActive : tab.icon} size={26} color={color} />
              )}
              {/* Instagram-style: icons only in the Guest List look; the names are still read out. */}
              {ticket ? null : (
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
