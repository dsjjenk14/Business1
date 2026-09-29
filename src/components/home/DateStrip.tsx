import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppText, Avatar, Card, GlyphTile } from '@/components/ui';
import type { DateModeStatus, MyDate } from '@/features/dates/api';
import { clockTime } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * "I'm On a Date" strip on Home. Hidden unless there's something to show:
 * Date Mode on (or waiting), a date request waiting on you, or an upcoming date.
 */
export function DateStrip({ mode, dates }: { mode: DateModeStatus | null; dates: MyDate[] }) {
  const t = useTheme();
  const router = useRouter();
  const incoming = dates.find((d) => d.status === 'pending' && !d.i_sent);
  const upcoming = dates.find((d) => d.status === 'accepted');

  if (mode?.status === 'active') {
    const due = mode.next_checkin_at ? clockTime(mode.next_checkin_at) : null;
    return (
      <Card accent="trust" onPress={() => router.push('/date-mode')} accessibilityLabel="Date Mode is on. Open">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name="shield" size={44} tone="trust" />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">On a date with {mode.partner.display_name}</AppText>
            <AppText variant="small" tone="muted">
              {due ? `Next check-in by ${due}` : 'Date Mode is on'}
            </AppText>
          </View>
          <AppText tone="trust" weight="bold">
            I&apos;m safe →
          </AppText>
        </View>
      </Card>
    );
  }
  if (mode?.status === 'waiting') {
    return (
      <Card accent="primary" onPress={() => router.push('/date-mode')} accessibilityLabel="Date Mode is waiting. Open">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name="heart" size={44} />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">
              {mode.i_started ? `Waiting for ${mode.partner.display_name.split(' ')[0]} to confirm` : `${mode.partner.display_name} wants to start Date Mode`}
            </AppText>
            <AppText variant="small" tone="muted">
              {mode.problem ?? 'Tap to open'}
            </AppText>
          </View>
        </View>
      </Card>
    );
  }
  const d = incoming ?? upcoming;
  if (!d) return null;
  return (
    <Card accent="primary" onPress={() => router.push({ pathname: '/dates/[id]', params: { id: String(d.id) } })} accessibilityLabel="Open date">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Avatar name={d.other_name} uri={d.other_avatar_url} size={44} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{d === incoming ? `${d.other_name} asked you on a date` : `Date with ${d.other_name}`}</AppText>
          <AppText variant="small" tone="muted">
            {d.label}
          </AppText>
        </View>
        <AppText tone="primary" weight="bold">
          →
        </AppText>
      </View>
    </Card>
  );
}
