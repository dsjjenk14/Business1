import { ComingSoon } from '@/components/ComingSoon';
import { AppText, Screen } from '@/components/ui';

export default function Pins() {
  return (
    <Screen>
      <AppText variant="h1" accessibilityRole="header">
        Pins
      </AppText>
      <ComingSoon
        phase={2}
        title="Nearby · They're In"
        body="Radius slider, category filters, trending pin, likes, replies, bookmarks, share, and New Pin with up to 6 photos."
      />
    </Screen>
  );
}
