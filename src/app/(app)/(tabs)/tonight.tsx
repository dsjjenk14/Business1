import { ComingSoon } from '@/components/ComingSoon';
import { AppText, Screen } from '@/components/ui';

export default function Tonight() {
  return (
    <Screen>
      <AppText variant="h1" accessibilityRole="header">
        Tonight
      </AppText>
      <ComingSoon
        phase={4}
        title="Tonight · This Weekend · Groups"
        body="Who's going out, events, the map, posting that you're going out, and the GPS vouch flow after an event."
       
      />
    </Screen>
  );
}
