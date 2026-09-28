import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';

import { AppText, type IconName } from '@/components/ui';
import { useSharedUnreadCounts } from '@/features/notifications/useUnreadCounts';
import { useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  pins: { label: 'Pins', icon: 'pin-outline', iconActive: 'pin' },
  tonight: { label: 'Tonight', icon: 'moon-outline', iconActive: 'moon' },
  messages: { label: 'Messages', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  circles: { label: 'Circles', icon: 'people-circle-outline', iconActive: 'people-circle' },
};

/** The tab bar: Home, Pins, Tonight, Messages, Circles. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme();
  const unread = useSharedUnreadCounts();

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

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={route.name === 'messages' && unread.messages ? `${tab.label}, new messages` : tab.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                alignItems: 'center',
                gap: 2,
                paddingHorizontal: t.space[1],
                paddingVertical: 4,
                minWidth: 56,
              }}>
              <View>
                <Ionicons name={focused ? tab.iconActive : tab.icon} size={22} color={color} />
                {route.name === 'messages' && unread.messages ? (
                  <View style={{ position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: t.colors.primary, borderWidth: 1.5, borderColor: t.colors.tabBar }} />
                ) : null}
              </View>
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
