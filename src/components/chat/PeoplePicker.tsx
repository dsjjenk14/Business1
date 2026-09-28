import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { ChatCandidate } from '@/features/chat/api';
import { useTheme } from '@/theme';

/** A checklist of people (for starting a group chat or adding to one). */
export function PeoplePicker({
  people,
  selected,
  onToggle,
  exclude = [],
}: {
  people: ChatCandidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  exclude?: string[];
}) {
  const t = useTheme();
  const list = people.filter((p) => !exclude.includes(p.id));
  return (
    <View style={{ gap: t.space[1] }}>
      {list.map((p) => {
        const on = selected.has(p.id);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={p.display_name}
            onPress={() => onToggle(p.id)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
            <Avatar name={p.display_name} uri={p.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <AppText weight="bold">{p.display_name}</AppText>
              <AppText variant="caption" tone="subtle">
                {p.in_circle ? 'Your friends' : 'You’ve chatted'}
              </AppText>
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? t.colors.primary : t.colors.textSubtle} />
          </Pressable>
        );
      })}
    </View>
  );
}
