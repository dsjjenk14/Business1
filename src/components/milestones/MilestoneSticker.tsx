import { MetalSticker } from '@/components/ui';
import { FAMOUS_AT, milestoneFor } from '@/features/milestones/api';

/** Each vouch milestone has its own metal or gem. The sticker shows just the number and "vouches". */
export const MATERIALS: Record<number, { name: string; stops: string[]; ink: string }> = {
  // Colors run from the top of the sticker to the bottom, lit like polished metal.
  10: { name: 'Bronze', stops: ['#F6D2A8', '#C98A5B', '#8A5530', '#C98A5B', '#6E401F'], ink: '#1E120A' },
  30: { name: 'Silver', stops: ['#FFFFFF', '#D7DBE2', '#9AA0AB', '#E2E5EA', '#80868F'], ink: '#14161A' },
  75: { name: 'Gold', stops: ['#FFF4C2', '#E8C25A', '#A67C1A', '#E3B94A', '#7D5C10'], ink: '#1E1606' },
  100: { name: 'Platinum', stops: ['#FFFFFF', '#E9ECEF', '#B8BEC5', '#F1F3F5', '#9CA3AA'], ink: '#14181C' },
  300: { name: 'Ruby', stops: ['#FF8FA3', '#D0193A', '#7A0016', '#C3122F', '#4A000C'], ink: '#FFFFFF' },
  500: { name: 'Sapphire', stops: ['#A9C4FF', '#2D5FD6', '#0E2A7A', '#2752C4', '#081A4F'], ink: '#FFFFFF' },
  1000: { name: 'Diamond', stops: ['#FFFFFF', '#E3F6FF', '#A9DBF5', '#F2FBFF', '#8FCFEF'], ink: '#0C2230' },
};

export function MilestoneSticker({ count, size }: { count: number | null | undefined; size?: number }) {
  const m = milestoneFor(count);
  if (!m) return null;
  const mat = MATERIALS[m]!;
  return (
    <MetalSticker
      label={m >= FAMOUS_AT ? '1,000' : String(m)}
      sub="VOUCHES"
      glyph={m >= FAMOUS_AT ? 'star' : undefined}
      stops={mat.stops}
      ink={mat.ink}
      sparkle={m >= FAMOUS_AT}
      size={size}
    />
  );
}
