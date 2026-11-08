import { View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { useTheme } from '@/theme';

// Made-up examples, clearly labeled, so a new member sees what Home looks like once it fills in.
const EXAMPLES = [
  { name: 'Maya', meta: 'Going Out · 2h', body: 'Dinner in Shaw at 8, two seats left. Who’s in?', ins: 9 },
  { name: 'Jordan', meta: 'Question · 5h', body: 'Best brunch spot for a group of 6 this Sunday?', ins: 4 },
];

/** Faded sample pins with an "Example" tag. Screen readers get one sentence instead. */
export function ExamplePins() {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel="Examples of what your Insiders' pins will look like" style={{ gap: t.space[2], opacity: 0.55 }}>
      {EXAMPLES.map((e) => (
        <View
          key={e.name}
          importantForAccessibility="no-hide-descendants"
          style={{ gap: t.space[2], padding: t.space[3], borderRadius: t.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.borderStrong }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
            <Avatar name={e.name} uri={null} size={32} />
            <View style={{ flex: 1 }}>
              <AppText variant="small" weight="bold">
                {e.name}
              </AppText>
              <AppText variant="caption" tone="subtle">
                {e.meta}
              </AppText>
            </View>
            <AppText variant="caption" weight="bold" tone="subtle" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Example
            </AppText>
          </View>
          <AppText variant="small">{e.body}</AppText>
          <AppText variant="caption" tone="muted">
            {e.ins} in
          </AppText>
        </View>
      ))}
    </View>
  );
}
