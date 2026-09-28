import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { useTheme } from '@/theme';

/** A tappable row for a member: avatar, name, a detail line, and an optional action on the right. */
export function PersonRow({
  id,
  name,
  avatarUrl,
  detail,
  vouches,
  right,
  ring,
  extra,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  detail?: string | null;
  vouches?: number | null;
  right?: React.ReactNode;
  ring?: 'trust' | 'primary' | 'ai' | null;
  /** Extra line under the detail (e.g. a live status). */
  extra?: React.ReactNode;
}) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 48 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${name}'s profile`}
        onPress={() => router.push({ pathname: '/people/[id]', params: { id } })}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Avatar name={name} uri={avatarUrl} size={40} ring={ring ?? null} />
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="bold" numberOfLines={1}>
            {name}
            {vouches != null ? <AppText variant="small" tone="trust">{`  ${vouches} ✓`}</AppText> : null}
          </AppText>
          {detail ? (
            <AppText variant="caption" tone="subtle" numberOfLines={1}>
              {detail}
            </AppText>
          ) : null}
          {extra}
        </View>
      </Pressable>
      {right}
    </View>
  );
}
