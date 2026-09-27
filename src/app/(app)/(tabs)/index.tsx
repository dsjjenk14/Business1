import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { VouchCard } from '@/components/home/VouchCard';
import { ComingSoon } from '@/components/ComingSoon';
import { AppText, Screen } from '@/components/ui';
import { useFirstWeekChecklist } from '@/features/onboarding/useFirstWeekChecklist';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { dismissed } = useFirstWeekChecklist();
  const shownChecklist = useRef(false);

  // First-week checklist pops up once after first login, until dismissed.
  useEffect(() => {
    if (dismissed === false && !shownChecklist.current) {
      shownChecklist.current = true;
      router.push('/checklist');
    }
  }, [dismissed, router]);

  const firstName = profile?.full_name.split(' ')[0] ?? '';

  return (
    <Screen>
      <View style={{ gap: t.space[1] }}>
        <AppText variant="label" tone="subtle">
          {greeting()}
        </AppText>
        <AppText variant="h1" accessibilityRole="header">
          Hey, {firstName} 👋
        </AppText>
      </View>

      <VouchCard vouchCount={profile?.vouch_count ?? 0} />

      <ComingSoon
        phase={2}
        title="Going out tonight · From your network · AI pick"
        body="The Go Live strip, the two latest pins from your network, and one ✦ AI pick land here next."
       
      />
    </Screen>
  );
}
