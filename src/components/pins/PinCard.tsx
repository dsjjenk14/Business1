import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Card, useToast } from '@/components/ui';
import { CATEGORY_LABEL, setBookmarked, setLiked, sharePin, type FeedPin } from '@/features/pins/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

import { PinPhotos } from './PinPhotos';

export type PinCardProps = {
  pin: FeedPin;
  /** What to show under the author: distance (Nearby) or city (They're In). */
  locationMode?: 'distance' | 'city' | 'none';
  onChange?: (pin: FeedPin) => void;
  /** Tap target: open the thread. Disabled on the thread screen itself. */
  linkToThread?: boolean;
};

const CATEGORY_TONE = {
  thought: 'primary',
  question: 'ai',
  photos: 'trust',
  event: 'sponsored',
  going_out: 'trust',
  recap: 'sponsored',
} as const;

export function formatDistance(mi: number | null): string | null {
  if (mi == null) return null;
  if (mi < 0.3) return 'nearby';
  return `~${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`;
}

export function PinCard({ pin, locationMode = 'none', onChange, linkToThread = true }: PinCardProps) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [busy, setBusy] = useState(false);

  const where =
    locationMode === 'distance' ? (pin.is_mine ? 'your pin' : formatDistance(pin.distance_mi)) : locationMode === 'city' ? pin.city_name : null;
  const meta = [pin.author_vouches != null ? `${pin.author_vouches} ✓` : null, timeAgo(pin.created_at), where, pin.place_label && locationMode !== 'city' ? pin.place_label : null]
    .filter(Boolean)
    .join(' · ');

  async function toggleLike() {
    if (!me || busy) return;
    const next = { ...pin, liked: !pin.liked, like_count: pin.like_count + (pin.liked ? -1 : 1) };
    onChange?.(next);
    setBusy(true);
    try {
      await setLiked(pin.id, me, next.liked);
    } catch {
      onChange?.(pin);
      toast("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (!me) return;
    const next = { ...pin, bookmarked: !pin.bookmarked };
    onChange?.(next);
    try {
      await setBookmarked(pin.id, me, next.bookmarked);
      toast(next.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks');
    } catch {
      onChange?.(pin);
      toast("Couldn't update. Try again.");
    }
  }

  const openThread = () => router.push({ pathname: '/pins/[id]', params: { id: String(pin.id) } });
  const openAuthor = () => (pin.is_mine ? router.push('/profile') : router.push({ pathname: '/people/[id]', params: { id: pin.author_id } }));

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="caption" weight="bold" tone={CATEGORY_TONE[pin.category]}>
            {CATEGORY_LABEL[pin.category]}
          </AppText>
          {pin.edited_at ? (
            <AppText variant="caption" tone="subtle">
              edited
            </AppText>
          ) : null}
        </View>

        <Pressable accessibilityRole={linkToThread ? 'link' : 'text'} disabled={!linkToThread} onPress={openThread}>
          <AppText variant={linkToThread ? 'body' : 'h3'} style={{ fontFamily: linkToThread ? t.fonts.bodyMedium : t.fonts.bodyBold }}>
            &ldquo;{pin.body}&rdquo;
          </AppText>
        </Pressable>

        <PinPhotos paths={pin.photo_paths} />

        <Pressable accessibilityRole="link" accessibilityLabel={`${pin.author_name}'s profile`} onPress={openAuthor} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Avatar name={pin.author_name} emoji={pin.author_emoji} uri={pin.author_avatar} size={32} />
          <View style={{ flex: 1 }}>
            <AppText variant="small" weight="bold">
              {pin.is_mine ? 'You' : pin.author_name}
            </AppText>
            <AppText variant="caption" tone="subtle" numberOfLines={1}>
              {meta}
            </AppText>
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: t.borderWidth.hairline, borderColor: t.colors.border, paddingTop: t.space[2] }}>
          <Action
            icon={pin.liked ? 'heart' : 'heart-outline'}
            color={pin.liked ? t.colors.primary : t.colors.textMuted}
            label={String(pin.like_count)}
            a11y={pin.liked ? `Unlike. ${pin.like_count} likes` : `Like. ${pin.like_count} likes`}
            onPress={toggleLike}
          />
          <Action icon="chatbubble-outline" color={t.colors.textMuted} label={String(pin.reply_count)} a11y={`${pin.reply_count} replies. Open thread`} onPress={openThread} />
          <View style={{ flex: 1 }} />
          <Action
            icon={pin.bookmarked ? 'bookmark' : 'bookmark-outline'}
            color={pin.bookmarked ? t.colors.sponsored : t.colors.textMuted}
            a11y={pin.bookmarked ? 'Remove bookmark' : 'Bookmark'}
            onPress={toggleBookmark}
          />
          <Action icon="share-outline" color={t.colors.textMuted} a11y="Share" onPress={() => sharePin(pin)} />
        </View>
      </View>
    </Card>
  );
}

function Action({ icon, color, label, a11y, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label?: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, minWidth: 44, paddingHorizontal: t.space[2], opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={color} />
      {label != null ? (
        <AppText variant="small" tone="muted">
          {label}
        </AppText>
      ) : null}
    </Pressable>
  );
}
