import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { marketDate, marketDayKey } from '@/lib/time';
import { useTheme } from '@/theme';

const DAY_MS = 86_400_000;

/** Days from today (DC time), e.g. Today, Tomorrow, Sat Oct 4 … */
export function upcomingDays(count: number, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getTime() + i * DAY_MS);
    const key = marketDayKey(d);
    const label =
      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
    return { key, label, weekday };
  });
}

/** Every 30 minutes from 6 AM to 11:30 PM, as minutes after midnight. */
const TIMES = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30);

export const minutesLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Day + time picker made of chips (no native picker needed, works the same on
 * iOS, Android and web). Times already past today are hidden.
 */
export function DateTimeChips({
  days,
  day,
  minutes,
  onChange,
}: {
  days: { key: string; label: string }[];
  day: string | null;
  minutes: number | null;
  onChange: (day: string, minutes: number | null) => void;
}) {
  const t = useTheme();
  const [now] = useState(() => Date.now());
  const times = day ? TIMES.filter((m) => marketDate(day, m).getTime() > now - 15 * 60_000) : [];
  return (
    <View style={{ gap: t.space[3] }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
        {days.map((d) => (
          <Chip key={d.key} label={d.label} selected={d.key === day} onPress={() => onChange(d.key, minutes)} />
        ))}
      </ScrollView>
      {day ? (
        times.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
            {times.map((m) => (
              <Chip key={m} label={minutesLabel(m)} selected={m === minutes} onPress={() => onChange(day, m)} />
            ))}
          </ScrollView>
        ) : (
          <AppText variant="small" tone="muted">
            It&apos;s too late for that day. Pick another.
          </AppText>
        )
      ) : null}
    </View>
  );
}
