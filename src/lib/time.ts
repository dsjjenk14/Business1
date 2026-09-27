/** "2m", "3h", "5d", or a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Launch market timezone. Event and going-out times are shown in local DC time, wherever the viewer is. */
export const MARKET_TIMEZONE = 'America/New_York';

/** "7:30 PM" in DC time. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: MARKET_TIMEZONE });
}

/** "Washington, DC" → "DC", "Fairfax, VA" → "Fairfax". */
export function shortCity(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/^Washington,\s*DC$/i.test(name)) return 'DC';
  return name.split(',')[0] ?? name;
}

/** "Tonight · 7:30 PM", "Tomorrow · 9:00 AM", "Sat · 9:00 AM", or "Oct 12 · 7:00 PM" (DC time). */
export function dayTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const dayKey = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: MARKET_TIMEZONE });
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  const key = dayKey(d);
  const hour = Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: MARKET_TIMEZONE }));
  const label =
    key === today
      ? hour >= 17 || hour < 4
        ? 'Tonight'
        : 'Today'
      : key === tomorrow
        ? 'Tomorrow'
        : d.getTime() - now.getTime() < 6 * 86_400_000
          ? d.toLocaleDateString('en-US', { weekday: 'short', timeZone: MARKET_TIMEZONE })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: MARKET_TIMEZONE });
  return `${label} · ${clockTime(iso)}`;
}

/** "YYYY-MM-DD" for a moment, in DC time. */
export function marketDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: MARKET_TIMEZONE });
}

/** The moment that is `minutes` after midnight on `dayKey` (YYYY-MM-DD) in DC time. */
export function marketDate(dayKey: string, minutes: number): Date {
  const [y = 1970, m = 1, d = 1] = dayKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // How far DC is behind UTC at that moment (handles daylight saving).
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TIMEZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(new Date(at))
        .map((p) => [p.type, Number(p.value)]),
    ) as Record<string, number>;
    return Date.UTC(parts.year ?? y, (parts.month ?? m) - 1, parts.day ?? d, parts.hour ?? 0, parts.minute ?? 0) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}
