import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar, IconButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useUnreadCounts } from '@/features/notifications/useUnreadCounts';
import { useTheme } from '@/theme';

import { Logo } from './Logo';

/** Header on the 4 main tabs: logo left; profile, messages, notifications, menu right. */
export function AppHeader() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const unread = useUnreadCounts();

  return (
    <View
      style={{
        paddingTop: insets.top + t.space[1],
        paddingBottom: t.space[2],
        paddingHorizontal: t.space[3],
        backgroundColor: t.colors.bg,
        borderBottomWidth: t.borderWidth.hairline,
        borderColor: t.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
      }}>
      <View style={{ flex: 1, paddingLeft: t.space[1] }}>
        <Logo />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        onPress={() => router.push('/profile')}
        hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Avatar name={profile?.display_name ?? 'You'} uri={profile?.avatar_url} emoji={profile?.avatar_emoji} size={32} ring="primary" />
      </Pressable>
      <IconButton icon="chatbubble-ellipses-outline" label="Messages" badgeCount={unread.messages} onPress={() => router.push('/messages')} />
      <IconButton icon="notifications-outline" label="Notifications" badgeCount={unread.notifications} onPress={() => router.push('/notifications')} />
      <IconButton icon="menu" label="Menu" onPress={() => router.push('/menu')} />
    </View>
  );
}

/** Header for detail screens: back button + title. */
export function BackHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View
      style={{
        paddingTop: insets.top + t.space[1],
        paddingBottom: t.space[2],
        paddingHorizontal: t.space[2],
        backgroundColor: t.colors.bg,
        borderBottomWidth: t.borderWidth.hairline,
        borderColor: t.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
      }}>
      <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <AppText variant="h3" numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: t.fonts.display }} accessibilityRole="header">
        {title ?? ''}
      </AppText>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
