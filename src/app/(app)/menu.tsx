import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Glyph, Screen, Section, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

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
      { label: 'Make an Intro', icon: 'hand-left-outline', href: '/circles/make-intro' },
      { label: 'Places', icon: 'star-half-outline', href: '/places' },
      { label: 'Search Members', icon: 'search-outline', href: '/search' },
      { label: 'Check In', icon: 'location-outline', href: '/circles/vouch' },
      { label: 'Vouches you gave', icon: 'ribbon-outline', href: '/settings/vouches' },
      { label: 'Intros', icon: 'people-outline', href: '/circles/intros' },
      { label: 'Tonight for You', icon: 'sparkles-outline', soon: 7, ai: true },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'My Profile', icon: 'person-outline', href: '/profile' },
      { label: "I'm On a Date", icon: 'heart-outline', href: '/date-mode' },
      { label: 'Safety & Check In', icon: 'shield-checkmark-outline', href: '/safety' },
      { label: 'Premium', icon: 'star-outline', href: '/premium' },
      { label: 'Appearance', icon: 'color-palette-outline', href: '/settings/appearance' },
      { label: 'Settings', icon: 'settings-outline', href: '/settings' },
    ],
  },
];

export default function Menu() {
  const t = useTheme();
  const router = useRouter();
  const { signOut, profile } = useAuth();
  const groups: typeof GROUPS =
    profile?.role === 'admin' ? [...GROUPS, { title: 'Team', items: [{ label: 'Admin', icon: 'construct-outline', href: '/admin' }] }] : GROUPS;

  return (
    <>
      <BackHeader title="Menu" />
      <Screen>
        {groups.map((group) => (
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
                    goBackOr(router, '/');
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
                  {item.ai ? <Glyph name="spark" size={14} tone="ai" strokeWidth={2} /> : null}
                  <AppText style={{ flex: 1 }} tone={item.ai ? 'ai' : 'text'}>
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
