import { HoloSticker } from '@/components/ui';
import { FAMOUS_AT, milestoneFor } from '@/features/milestones/api';

/** Each vouch milestone has its own metal or gem. The sticker shows just the number and "vouches". */
export const MATERIALS: Record<number, { name: string; stops: string[]; ink: string }> = {
  10: { name: 'Bronze', stops: ['#5C3A1E', '#C98A5B', '#F3C9A0', '#C98A5B', '#7A4A26'], ink: '#1E120A' },
  30: { name: 'Silver', stops: ['#6E7480', '#C7CCD6', '#FFFFFF', '#AEB4BF', '#6E7480'], ink: '#14161A' },
  75: { name: 'Gold', stops: ['#8A6A12', '#D4AF37', '#FFF1B8', '#D4AF37', '#8A6A12'], ink: '#1E1606' },
  100: { name: 'Platinum', stops: ['#8C9AA6', '#E5E4E2', '#FFFFFF', '#CFD6DC', '#8C9AA6'], ink: '#14181C' },
  300: { name: 'Ruby', stops: ['#5A0010', '#B0102A', '#FF6A86', '#B0102A', '#5A0010'], ink: '#FFFFFF' },
  500: { name: 'Sapphire', stops: ['#0B1E5B', '#1F4FC2', '#8DB4FF', '#1F4FC2', '#0B1E5B'], ink: '#FFFFFF' },
  1000: { name: 'Diamond', stops: ['#9FD8F5', '#FFFFFF', '#CFEFFF', '#FFFFFF', '#8CCDEF'], ink: '#0C2230' },
};

export function MilestoneSticker({ count, size }: { count: number | null | undefined; size?: number }) {
  const m = milestoneFor(count);
  if (!m) return null;
  const mat = MATERIALS[m]!;
  return (
    <HoloSticker
      label={m >= FAMOUS_AT ? '1,000' : String(m)}
      sub="VOUCHES"
      glyph={m >= FAMOUS_AT ? 'star' : undefined}
      stops={mat.stops}
      ink={mat.ink}
      size={size}
    />
  );
}
