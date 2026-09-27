import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function IconButton({
  icon,
  label,
  onPress,
  badgeCount,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badgeCount?: number;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badgeCount ? `${label}, ${badgeCount} new` : label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={size} color={t.colors.text} />
      {badgeCount ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 4,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: t.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText variant="caption" weight="bold" style={{ color: t.colors.onPrimary, fontSize: 10, lineHeight: 12 }}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
