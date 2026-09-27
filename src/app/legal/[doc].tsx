import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen } from '@/components/ui';
import { LEGAL_DOCS, type LegalKey } from '@/features/legal/content';
import { useTheme } from '@/theme';

/** Terms, Privacy Policy and Community Guidelines. Readable signed in or out. */
export default function LegalDocScreen() {
  const t = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL_DOCS[(doc as LegalKey) in LEGAL_DOCS ? (doc as LegalKey) : 'terms'];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={content.title} />
      <Screen contentGap={t.space[5]}>
        <AppText variant="caption" tone="subtle">
          Last updated {content.updated}
        </AppText>
        {content.sections.map((s) => (
          <View key={s.heading} style={{ gap: t.space[2] }}>
            <AppText variant="h3" accessibilityRole="header">
              {s.heading}
            </AppText>
            <AppText tone="muted">{s.body}</AppText>
          </View>
        ))}
      </Screen>
    </View>
  );
}
