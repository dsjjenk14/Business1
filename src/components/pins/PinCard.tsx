import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Badge, Button, Card, Glyph, OptionsSheet, useToast, type GlyphName } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { enableArrivalWatch } from '@/features/arrival/geofence';
import { CATEGORY_GLYPH, CATEGORY_LABEL, REACTIONS, reactToPin, setBookmarked, setLiked, sharePin, type FeedPin, type Reaction } from '@/features/pins/api';
import { rsvp } from '@/features/tonight/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { dayTime, timeAgo } from '@/lib/time';
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

  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);

  async function react(kind: Reaction | null) {
    setPicking(false);
    const was = pin;
    const next = {
      ...pin,
      liked: kind != null,
      my_reaction: kind,
      like_count: pin.like_count + (kind != null && !pin.liked ? 1 : kind == null && pin.liked ? -1 : 0),
      top_reactions: kind && !(pin.top_reactions ?? []).includes(kind) ? [...(pin.top_reactions ?? []), kind] : pin.top_reactions,
    };
    onChange?.(next);
    try {
      await reactToPin(pin.id, kind);
      track('pin_reacted', { kind: kind ?? 'none' });
    } catch {
      onChange?.(was);
      toast("Couldn't update. Try again.");
    }
  }
  const menuOptions = [
    { label: pin.bookmarked ? 'Remove bookmark' : 'Bookmark', onPress: toggleBookmark },
    { label: 'Open thread', onPress: openThread },
    ...(!pin.is_mine
      ? [
          { label: `View ${pin.author_name.split(' ')[0]}'s profile`, onPress: openAuthor },
          { label: 'Report this pin', danger: true, onPress: () => router.push({ pathname: '/report', params: { pin: String(pin.id), name: pin.author_name } }) },
        ]
      : []),
  ];
  const hasPhotos = pin.photo_paths.length > 0;

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        {/* Who, when, where. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${pin.author_name}'s profile`}
            onPress={openAuthor}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
            <Avatar name={pin.author_name} uri={pin.author_avatar} size={40} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppText weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {pin.is_mine ? 'You' : pin.author_name}
                </AppText>
                {pin.author_verified ? <Ionicons name="checkmark-circle" size={15} color={t.colors.trust} accessibilityLabel="Verified" /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Glyph name={CATEGORY_GLYPH[pin.category]} size={12} tone={CATEGORY_TONE[pin.category]} strokeWidth={2} />
                <AppText variant="caption" tone="subtle" numberOfLines={1} style={{ flex: 1 }}>
                  {[CATEGORY_LABEL[pin.category], meta, pin.edited_at ? 'edited' : null].filter(Boolean).join(' · ')}
                </AppText>
              </View>
            </View>
          </Pressable>
          <Action icon="ellipsis-horizontal" color={t.colors.textMuted} a11y="More options" onPress={() => setMenu(true)} />
        </View>

        {/* Photos first, edge to edge. */}
        {hasPhotos ? (
          <Pressable accessibilityRole={linkToThread ? 'link' : 'image'} disabled={!linkToThread} onPress={openThread} style={{ marginHorizontal: -t.space[4] }}>
            <PinPhotos paths={pin.photo_paths} bleed />
          </Pressable>
        ) : null}

        <Pressable accessibilityRole={linkToThread ? 'link' : 'text'} disabled={!linkToThread} onPress={openThread}>
          <AppText
            variant={hasPhotos || !linkToThread ? 'body' : 'h3'}
            style={{ fontFamily: hasPhotos ? t.fonts.body : t.fonts.bodyMedium }}
            numberOfLines={linkToThread ? 8 : undefined}>
            {pin.body}
          </AppText>
        </Pressable>

        {pin.event_id && pin.event_title && pin.event_starts_at ? (
          <EventStrip pin={pin} onChange={onChange} />
        ) : null}

        {picking ? (
          <View accessibilityRole="menu" style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: t.space[1], padding: t.space[1], borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceAlt }}>
            {REACTIONS.map((r) => {
              const mine = pin.my_reaction === r.key;
              return (
                <Pressable
                  key={r.key}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${r.label}${mine ? ', your reaction' : ''}`}
                  onPress={() => react(mine ? null : r.key)}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? t.colors.surface : 'transparent' }}>
                  <Glyph name={r.key} size={24} color={r.key === 'heart' ? t.colors.primary : t.colors.sponsored} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -t.space[2] }}>
          <Action
            icon={pin.liked ? 'heart' : 'heart-outline'}
            color={pin.liked ? t.colors.primary : t.colors.textMuted}
            label={String(pin.like_count)}
            a11y={pin.liked ? `Unlike. ${pin.like_count} likes` : `Like. ${pin.like_count} likes`}
            onPress={toggleLike}
            onLongPress={() => setPicking(true)}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="React" onPress={() => setPicking((v) => !v)} hitSlop={6} style={{ minHeight: 40, minWidth: 36, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {(pin.top_reactions ?? []).filter((k) => k !== 'heart').length ? (
              (pin.top_reactions ?? [])
                .filter((k) => k !== 'heart')
                .slice(0, 2)
                .map((k) => <Glyph key={k} name={k as GlyphName} size={16} color={t.colors.sponsored} />)
            ) : (
              <Glyph name="smile" size={18} color={t.colors.textMuted} />
            )}
          </Pressable>
          <Action icon="chatbubble-outline" color={t.colors.textMuted} label={String(pin.reply_count)} a11y={`${pin.reply_count} replies. Open thread`} onPress={openThread} />
          <Action icon="share-outline" color={t.colors.textMuted} a11y="Share" onPress={() => sharePin(pin)} />
          <View style={{ flex: 1 }} />
          <Action
            icon={pin.bookmarked ? 'bookmark' : 'bookmark-outline'}
            color={pin.bookmarked ? t.colors.sponsored : t.colors.textMuted}
            a11y={pin.bookmarked ? 'Remove bookmark' : 'Bookmark'}
            onPress={toggleBookmark}
          />
        </View>
      </View>
      <OptionsSheet visible={menu} options={menuOptions} onClose={() => setMenu(false)} />
    </Card>
  );
}

function Action({
  icon,
  color,
  label,
  a11y,
  onPress,
  onLongPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label?: string;
  a11y: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      onLongPress={onLongPress}
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

/** The event a post shares, with I'm In right on the post. */
function EventStrip({ pin, onChange }: { pin: FeedPin; onChange?: (pin: FeedPin) => void }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const [busy, setBusy] = useState(false);
  const starts = pin.event_starts_at as string;
  const [now] = useState(() => Date.now());
  const over = new Date(starts).getTime() < now - 3 * 3600_000;

  async function imIn() {
    if (!me || !pin.event_id) return;
    setBusy(true);
    try {
      await rsvp(pin.event_id, me);
      onChange?.({ ...pin, event_i_am_going: true, event_going_count: (pin.event_going_count ?? 0) + 1 });
      toast(`You're in: ${pin.event_title}`);
      track('event_im_in', { from: 'post' });
      enableArrivalWatch();
    } catch (e) {
      if (/ticketed/i.test(friendlyError(e))) router.push({ pathname: '/events/[id]', params: { id: String(pin.event_id) } });
      else toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: t.colors.surfaceAlt,
      }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Event: ${pin.event_title}, ${dayTime(starts)}`}
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(pin.event_id) } })}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <Glyph name="calendar" size={22} tone="primary" />
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="bold" numberOfLines={1}>
            {pin.event_title}
          </AppText>
          <AppText variant="caption" tone="subtle" numberOfLines={1}>
            {[dayTime(starts), pin.event_going_count != null ? `${pin.event_going_count} going` : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </Pressable>
      {over ? null : pin.event_i_am_going ? (
        <Badge label="You're in" glyph="check" tone="trust" />
      ) : (
        <Button label="I'm In" size="md" onPress={imIn} loading={busy} />
      )}
    </View>
  );
}
