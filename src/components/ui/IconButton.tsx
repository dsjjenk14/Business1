import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

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
        // A calm dot, not a number: "something new", without the homework feeling.
        <View style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: t.colors.primary, borderWidth: 1.5, borderColor: t.colors.bg }} />
      ) : null}
    </Pressable>
  );
}
