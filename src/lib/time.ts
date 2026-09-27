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
