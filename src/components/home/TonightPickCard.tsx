import { View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import type { TonightPick } from '@/features/tonight/api';
import { clockTime } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * One pick for tonight. For now it's rule-based (the event most of your network
 * is going to), so it has no ✦ AI marker. The AI version replaces it in Phase 7.
 */
export function TonightPickCard({ pick, onRsvp, rsvpd }: { pick: TonightPick; onRsvp: () => void; rsvpd: boolean }) {
  const t = useTheme();
  const time = clockTime(pick.starts_at);
  const going = pick.network_going.length
    ? `${pick.network_going.slice(0, 2).join(', ')}${pick.network_going.length > 2 ? ' and others' : ''} from your network ${pick.network_going.length === 1 ? 'is' : 'are'} going`
    : `${pick.going_count} going`;

  return (
    <Card accent="sponsored">
      <View style={{ gap: t.space[2] }}>
        <AppText variant="label" tone="sponsored">
          Pick for tonight
        </AppText>
        <AppText variant="h3">
          {pick.emoji ? `${pick.emoji} ` : ''}
          {pick.title}
        </AppText>
        <AppText variant="small" tone="muted">
          {[pick.host_name ? `${pick.host_name} hosting` : null, time, pick.neighborhood].filter(Boolean).join(' · ')}
        </AppText>
        <AppText variant="small">{going}.</AppText>
        {pick.spots_left != null ? (
          <AppText variant="caption" tone={pick.spots_left <= 2 ? 'primary' : 'subtle'}>
            {pick.spots_left === 0 ? 'Full' : `${pick.spots_left} spot${pick.spots_left === 1 ? '' : 's'} left`}
          </AppText>
        ) : null}
        <Button label={rsvpd ? "You're going ✓" : 'RSVP'} size="md" variant={rsvpd ? 'trust' : 'primary'} disabled={rsvpd || pick.spots_left === 0} onPress={onRsvp} />
      </View>
    </Card>
  );
}
