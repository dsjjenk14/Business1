import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

/** Read-only stars, e.g. 4.5 → four full stars and a half. */
export function Stars({ value, size = 16, count }: { value: number; size?: number; count?: number }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${value.toFixed(1)} out of 5 stars${count != null ? `, ${count} rating${count === 1 ? '' : 's'}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={t.colors.sponsored}
        />
      ))}
      {count != null ? (
        <AppText variant="small" tone="muted" style={{ marginLeft: 4 }}>
          {value.toFixed(1)} ({count})
        </AppText>
      ) : null}
    </View>
  );
}

const WORDS = ['', 'Bad', 'Meh', 'Good', 'Great', 'Amazing'];

/** Tap 1–5 stars. Each star is a 44pt target. */
export function StarsInput({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityRole="radiogroup" accessibilityLabel="Stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="radio"
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}: ${WORDS[n]}`}
          accessibilityState={{ checked: value === n }}
          aria-checked={value === n}
          onPress={() => onChange(n)}
          hitSlop={4}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={value >= n ? 'star' : 'star-outline'} size={30} color={value >= n ? t.colors.sponsored : t.colors.textSubtle} />
        </Pressable>
      ))}
      {value ? (
        <AppText weight="bold" tone="sponsored" style={{ marginLeft: t.space[2] }}>
          {WORDS[value]}
        </AppText>
      ) : null}
    </View>
  );
}
