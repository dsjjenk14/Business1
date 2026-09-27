import { ComingSoon } from '@/components/ComingSoon';
import { AppText, Screen } from '@/components/ui';

export default function Circles() {
  return (
    <Screen>
      <AppText variant="h1" accessibilityRole="header">
        Circles
      </AppText>
      <ComingSoon
        phase={3}
        title="My Circle · Network · Groups"
        body="Your ring diagram, vouches received, 1st and 2nd degree, intros, and groups."
       
      />
    </Screen>
  );
}
