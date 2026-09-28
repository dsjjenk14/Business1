import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { PinCard } from '@/components/pins/PinCard';
import { PhotoGrid } from '@/components/profile/PhotoGrid';
import { AppText, Avatar, Badge, Button, Card, GlyphTile, isGlyphName, Section, Segmented, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { tierProgress, useAppConfig } from '@/config/useAppConfig';
import type { FeedPin } from '@/features/pins/api';
import { fetchFollowInfo, profileLink, setFollowing, type FollowInfo, type ProfileCard } from '@/features/profiles/api';
import { friendlyError } from '@/lib/supabase';
import { clockTime, shortCity, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** The profile layout, shared by your own profile and everyone else's. */
export function ProfileView({
  card,
  pins,
  onPinChange,
  actions,
  children,
}: {
  card: ProfileCard;
  pins: FeedPin[];
  onPinChange: (p: FeedPin) => void;
  /** Buttons under the header (Vouch / Message, or Edit profile). */
  actions?: React.ReactNode;
  /** Extra sections at the end (your own profile adds invite code, settings…). */
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const router = useRouter();
  const { tiers } = useAppConfig();
  const { current } = tierProgress(card.vouch_count ?? 0, tiers);
  const place = card.neighborhood || card.city_name;
  const subtitle = [card.age ? String(card.age) : null, place, card.pronouns].filter(Boolean).join(' · ');
  const verified = card.id_verified || card.photo_verified;
  const toast = useToast();
  const [follow, setFollow] = useState<FollowInfo | null>(null);
  const [postsView, setPostsView] = useState<'grid' | 'all'>('grid');
  const hasPhotos = pins.some((p) => p.photo_paths.length > 0);

  useFocusEffect(
    useCallback(() => {
      fetchFollowInfo(card.id)
        .then(setFollow)
        .catch(() => undefined);
    }, [card.id]),
  );

  async function toggleFollow() {
    if (!follow) return;
    const next = !follow.i_follow;
    setFollow({ ...follow, i_follow: next, followers: follow.followers + (next ? 1 : -1) });
    try {
      await setFollowing(card.id, next);
      track(next ? 'followed' : 'unfollowed');
    } catch (e) {
      setFollow(follow);
      toast(friendlyError(e));
    }
  }

  const shareProfile = () =>
    Share.share({ message: `${card.is_me ? 'Find me' : `Check out ${card.display_name}`} on I'm In: ${profileLink(card.id)}` }).catch(() => undefined);

  return (
    <>
      <View style={{ alignItems: 'center', gap: t.space[3] }}>
        <View>
          <Avatar name={card.display_name} uri={card.avatar_url} size={104} ring={card.tonight ? 'trust' : 'primary'} />
          {verified ? (
            <View
              accessible
              accessibilityLabel="Verified"
              style={{ position: 'absolute', right: 2, bottom: 2, backgroundColor: t.colors.bg, borderRadius: 14 }}>
              <Ionicons name="checkmark-circle" size={28} color={t.colors.trust} />
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'center', gap: t.space[1] }}>
          <AppText variant="h1" accessibilityRole="header" align="center">
            {card.display_name}
          </AppText>
          {subtitle ? (
            <AppText tone="muted" align="center">
              {subtitle}
            </AppText>
          ) : null}
          {card.headline ? (
            <AppText variant="small" tone="subtle" align="center">
              {card.headline}
            </AppText>
          ) : null}
        </View>
        {/* Two badges at most: what people vouch them for (or their level), and one status. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space[2] }}>
          {card.top_vouch_word ? (
            <Badge label={`${card.top_vouch_word}${card.city_name ? ` · ${shortCity(card.city_name)}` : ''}`} glyph="medal" tone="trust" />
          ) : current ? (
            <Badge label={current.name} glyph={isGlyphName(current.emoji) ? current.emoji : 'medal'} tone="trust" />
          ) : null}
          {card.is_founding_member ? (
            <Badge label="Founding Member" glyph="star" tone="sponsored" />
          ) : card.is_premium ? (
            <Badge label="Premium" glyph="star" tone="sponsored" />
          ) : null}
        </View>
        {card.id_verified ? (
          <AppText variant="caption" tone="subtle" align="center">
            ID verified
          </AppText>
        ) : null}
        {!card.is_me && card.degree ? (
          <AppText variant="small" tone="muted" align="center">
            {card.degree === 1
              ? 'In your circle (1st degree)'
              : `2nd degree · you both know ${card.via.map((v) => v.display_name).slice(0, 3).join(', ')}`}
          </AppText>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: t.space[3] }}>
        {[
          { n: card.vouch_count, label: 'Vouches', tone: 'trust' as const },
          { n: card.circle_count, label: 'Circle', tone: 'primary' as const },
          { n: follow?.followers ?? null, label: 'Followers', tone: 'ai' as const },
        ].map((s) => (
          <Card key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: t.space[3] }}>
            <AppText variant="number" tone={s.tone}>
              {s.n == null ? '·' : s.n}
            </AppText>
            <AppText variant="label" tone="subtle">
              {s.label}
            </AppText>
          </Card>
        ))}
      </View>

      {card.tonight ? (
        <Card accent="trust">
          <AppText variant="small" weight="bold" tone="trust">
            {card.tonight.is_hosting ? 'Hosting tonight' : 'Going out tonight'}
            {card.tonight.place ? ` · ${card.tonight.place}` : ''} · {clockTime(card.tonight.starts_at)}
          </AppText>
          {card.tonight.note ? (
            <AppText variant="small" tone="muted">
              {card.tonight.note}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {actions}

      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        {!card.is_me && follow ? (
          <Button
            label={follow.i_follow ? 'Following' : follow.follows_me ? 'Follow back' : 'Follow'}
            size="md"
            variant={follow.i_follow ? 'secondary' : 'primary'}
            style={{ flex: 1 }}
            onPress={toggleFollow}
            accessibilityLabel={follow.i_follow ? `Unfollow ${card.display_name}` : `Follow ${card.display_name}`}
          />
        ) : null}
        <Button label="Share profile" size="md" variant="secondary" style={{ flex: 1 }} onPress={shareProfile} />
      </View>

      {card.bio ? (
        <Section title="About">
          <AppText>{card.bio}</AppText>
        </Section>
      ) : null}

      <Section title={`Vouched by${card.vouches.length ? ` (${card.vouch_count ?? card.vouches.length})` : ''}`}>
        {card.vouches.length === 0 ? (
          <AppText variant="small" tone="muted">
            No vouches yet. Vouches come from people who met {card.is_me ? 'you' : card.display_name.split(' ')[0]} in person, confirmed by GPS.
          </AppText>
        ) : (
          card.vouches.slice(0, 6).map((v) => (
            <Pressable
              key={`${v.voucher_id}-${v.created_at}`}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/people/[id]', params: { id: v.voucher_id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <Avatar name={v.display_name} uri={v.avatar_url} size={36} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" weight="bold">
                  {v.display_name}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {v.type === 'invite' ? 'Invited them in' : [v.place ? `GPS confirmed · ${v.place}` : 'GPS confirmed', timeAgo(v.created_at)].join(' · ')}
                </AppText>
              </View>
              {v.word ? <Badge label={v.word} tone="trust" /> : null}
            </Pressable>
          ))
        )}
      </Section>

      {card.groups.length > 0 ? (
        <Section title="Groups">
          {card.groups.map((g) => (
            <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <GlyphTile name={g.emoji} size={36} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" weight="bold">
                  {g.name}
                </AppText>
                {g.schedule ? (
                  <AppText variant="caption" tone="subtle">
                    {g.schedule}
                  </AppText>
                ) : null}
              </View>
              {g.role === 'owner' ? <Badge label="Owner" glyph="crown" tone="sponsored" /> : null}
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Posts">
        {pins.length === 0 ? (
          <AppText variant="small" tone="muted">
            No posts you can see yet.
          </AppText>
        ) : (
          <View style={{ gap: t.space[3] }}>
            {hasPhotos ? (
              <Segmented<'grid' | 'all'>
                options={[
                  { key: 'grid', label: 'Photos' },
                  { key: 'all', label: 'All posts' },
                ]}
                value={postsView}
                onChange={setPostsView}
              />
            ) : null}
            {hasPhotos && postsView === 'grid' ? (
              <PhotoGrid pins={pins} />
            ) : (
              pins.map((p) => <PinCard key={p.id} pin={p} onChange={onPinChange} />)
            )}
          </View>
        )}
      </Section>

      {children}
    </>
  );
}
