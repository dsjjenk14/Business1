import { HoloSticker, StickerCircle } from '@/components/ui';
import { FAMOUS_AT, milestoneFor } from '@/features/milestones/api';
import { useTheme } from '@/theme';

/**
 * The sticker for someone's vouch milestone: just the number and "vouches".
 * 10 / 30 / 75 are solid stickers; 100 and up are holographic; 1000 gets a star.
 */
export function MilestoneSticker({ count, size }: { count: number | null | undefined; size?: number }) {
  const t = useTheme();
  const m = milestoneFor(count);
  if (!m) return null;
  if (m >= 100) return <HoloSticker label={m >= FAMOUS_AT ? '1,000' : String(m)} sub="VOUCHES" glyph={m >= FAMOUS_AT ? 'star' : undefined} size={size} />;
  const fill = m >= 75 ? t.colors.secondary : m >= 30 ? t.colors.ai : t.colors.trust;
  const ink = m >= 75 ? t.colors.onSecondary : m >= 30 ? t.colors.onAi : t.colors.onTrust;
  return <StickerCircle label={`${m} vouches`} fill={fill} ink={ink} glyph="check" slap />;
}
