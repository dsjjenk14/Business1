import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen, Section, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

type Item = { label: string; icon: IconName; href?: Href; soon?: number; ai?: boolean };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Go',
    items: [
      { label: 'Home', icon: 'home-outline', href: '/' },
      { label: 'Pins', icon: 'pin-outline', href: '/pins' },
      { label: 'Tonight', icon: 'moon-outline', href: '/tonight' },
      { label: 'Circles', icon: 'people-circle-outline', href: '/circles' },
      { label: 'Messages', icon: 'chatbubble-ellipses-outline', href: '/messages' },
      { label: 'Notifications', icon: 'notifications-outline', href: '/notifications' },
    ],
  },
  {
    title: 'Discover',
    items: [
      { label: 'Make an Intro', icon: 'hand-left-outline', soon: 3 },
      { label: 'Featured Places', icon: 'megaphone-outline', soon: 6 },
      { label: 'Search Members', icon: 'search-outline', soon: 3 },
      { label: 'Tonight for You', icon: 'sparkles-outline', soon: 7, ai: true },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'My Profile', icon: 'person-outline', href: '/profile' },
      { label: 'Safety & Check In', icon: 'shield-checkmark-outline', soon: 5 },
      { label: 'Appearance', icon: 'color-palette-outline', href: '/settings/appearance' },
      { label: 'Settings', icon: 'settings-outline', soon: 6 },
    ],
  },
];

export default function Menu() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <>
      <BackHeader title="Menu" />
      <Screen>
        {GROUPS.map((group) => (
          <Section key={group.title} title={group.title} bare>
            <View>
              {group.items.map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={item.soon ? `${item.label}, coming in phase ${item.soon}` : item.label}
                  disabled={!item.href}
                  onPress={() => {
                    if (!item.href) return;
                    router.back();
                    router.push(item.href);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[3],
                    minHeight: 48,
                    paddingHorizontal: t.space[4],
                    opacity: pressed ? 0.6 : item.href ? 1 : 0.55,
                  })}>
                  <Ionicons name={item.icon} size={20} color={item.ai ? t.colors.ai : t.colors.text} />
                  <AppText style={{ flex: 1 }} tone={item.ai ? 'ai' : 'text'}>
                    {item.ai ? '✦ ' : ''}
                    {item.label}
                  </AppText>
                  {item.soon ? (
                    <AppText variant="caption" tone="subtle">
                      Phase {item.soon}
                    </AppText>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={t.colors.textSubtle} />
                  )}
                </Pressable>
              ))}
            </View>
          </Section>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 48, paddingHorizontal: t.space[4] }}>
          <Ionicons name="log-out-outline" size={20} color={t.colors.danger} />
          <AppText tone="danger" weight="bold">
            Sign Out
          </AppText>
        </Pressable>
      </Screen>
    </>
  );
}
