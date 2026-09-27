import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';

import { AppText, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  pins: { label: 'Pins', icon: 'pin-outline', iconActive: 'pin' },
  tonight: { label: 'Tonight', icon: 'moon-outline', iconActive: 'moon' },
  circles: { label: 'Circles', icon: 'people-circle-outline', iconActive: 'people-circle' },
};

/** The fixed 4-tab bar: Home, Pins, Tonight, Circles. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme();
  const sticker = t.style.badge === 'sticker';

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.tabBar,
        borderTopWidth: sticker ? t.borderWidth.strong : t.borderWidth.hairline,
        borderColor: sticker ? t.colors.outline : t.colors.border,
        paddingTop: t.space[2],
        paddingBottom: Math.max(insets.bottom, t.space[2]),
        paddingHorizontal: t.space[2],
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? (sticker ? t.colors.onPrimary : t.colors.tabActive) : t.colors.tabInactive;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
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
                borderRadius: t.radius.md,
                minWidth: 64,
                backgroundColor: focused && sticker ? t.colors.primary : 'transparent',
                borderWidth: focused && sticker ? t.borderWidth.regular : 0,
                borderColor: t.colors.outline,
                boxShadow: focused && sticker ? t.shadow.pressed : undefined,
              }}>
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={22} color={color} />
              <AppText variant="caption" weight="bold" style={{ color }}>
                {tab.label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
