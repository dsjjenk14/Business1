import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen, Section, type IconName } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

type Row = { label: string; icon: IconName; href?: Href; onPress?: () => void; danger?: boolean; detail?: string };

/** Settings hub. Everything account, privacy and safety related lives here. */
export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const { settings } = useAppConfig();
  const supportEmail = String(settings.support_email ?? 'support@imin.app');

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Account',
      rows: [
        { label: 'Edit profile', icon: 'person-outline', href: '/settings/profile' },
        { label: 'Your plan', icon: 'star-outline', href: '/settings/plan' },
        { label: 'Verification', icon: 'shield-checkmark-outline', href: '/settings/verification', detail: 'Phone, photo, ID' },
        { label: 'Notifications', icon: 'notifications-outline', href: '/settings/notifications' },
        { label: 'Appearance', icon: 'color-palette-outline', href: '/settings/appearance' },
      ],
    },
    {
      title: 'Privacy & safety',
      rows: [
        { label: 'Privacy', icon: 'lock-closed-outline', href: '/settings/privacy', detail: 'Who sees what' },
        { label: 'Blocked members', icon: 'ban-outline', href: '/settings/blocked' },
        { label: 'My reports', icon: 'flag-outline', href: '/settings/reports' },
      ],
    },
    {
      title: 'About',
      rows: [
        { label: 'Community Guidelines', icon: 'shield-outline', href: '/legal/guidelines' },
        { label: 'Terms of Service', icon: 'document-text-outline', href: '/legal/terms' },
        { label: 'Privacy Policy', icon: 'document-text-outline', href: '/legal/privacy' },
        { label: 'Contact support', icon: 'mail-outline', onPress: () => Linking.openURL(`mailto:${supportEmail}`), detail: supportEmail },
      ],
    },
  ];

  const renderRow = (r: Row) => (
    <Pressable
      key={r.label}
      accessibilityRole="button"
      onPress={() => (r.href ? router.push(r.href) : r.onPress?.())}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 50, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={r.icon} size={20} color={r.danger ? t.colors.danger : t.colors.text} />
      <View style={{ flex: 1 }}>
        <AppText tone={r.danger ? 'danger' : 'text'} weight={r.danger ? 'bold' : undefined}>
          {r.label}
        </AppText>
        {r.detail ? (
          <AppText variant="caption" tone="subtle">
            {r.detail}
          </AppText>
        ) : null}
      </View>
      {r.href ? <Ionicons name="chevron-forward" size={16} color={t.colors.textSubtle} /> : null}
    </Pressable>
  );

  return (
    <>
      <BackHeader title="Settings" />
      <Screen>
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            {g.rows.map(renderRow)}
          </Section>
        ))}
        <View>
          {renderRow({ label: 'Sign out', icon: 'log-out-outline', onPress: signOut })}
          {renderRow({ label: 'Delete account', icon: 'trash-outline', href: '/settings/delete-account', danger: true })}
        </View>
      </Screen>
    </>
  );
}
