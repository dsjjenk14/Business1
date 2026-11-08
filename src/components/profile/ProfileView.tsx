import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Share, View } from 'react-native';

import { PinCard } from '@/components/pins/PinCard';
import { PhotoGrid } from '@/components/profile/PhotoGrid';
import { AppText, Avatar, Badge, Button, Card, GlyphTile, Section, SpecialSticker, Glyph } from '@/components/ui';
import { STATUS_COLORS, STATUS_LABELS, usePersonInfo } from '@/features/people/status';
import type { FeedPin } from '@/features/pins/api';
import { MusicChip } from '@/components/music/MusicChip';
import { MilestoneSticker } from '@/components/milestones/MilestoneSticker';
import { HeaderSheet, MoodSheet, StrengthBar } from '@/components/profile/ProfileExtras';
import { FAMOUS_AT, milestoneFor } from '@/features/milestones/api';
import { PromptCards } from '@/components/profile/PromptsEditor';
import { profileAccent } from '@/features/profiles/customize';
import { StoryShareButton } from '@/components/share/StoryShareButton';
import { fetchLockedIn, profileLink, type LockedInPerson, type ProfileCard } from '@/features/profiles/api';
import { clockTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

type Tab = 'pins' | 'photos' | 'vouches';

/** The profile layout, shared by your own profile and everyone else's. */
export function ProfileView({
  card,
  pins,
  onPinChange,
  actions,
  children,
  onEdited,
}: {
  card: ProfileCard;
  /** Your own profile: reload after a quick edit (mood, header, color). */
  onEdited?: () => void;
  pins: FeedPin[];
  onPinChange: (p: FeedPin) => void;
  /** Buttons under the header (Vouch / Message, or Edit profile). */
  actions?: React.ReactNode;
  /** Extra sections at the end (your own profile adds invite code, settings…). */
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const router = useRouter();
  const place = card.neighborhood || card.city_name;
  // Skip the area when the headline already says it (e.g. "Howard Alum · Fairfax, VA").
  const placeInHeadline = !!place && !!card.headline && card.headline.toLowerCase().includes(place.toLowerCase());
  const subtitle = [card.age ? String(card.age) : null, placeInHeadline ? null : place, card.pronouns].filter(Boolean).join(' · ');
  const verified = card.id_verified || card.photo_verified;
  const [tab, setTab] = useState<Tab>('pins');
  const hasPhotos = pins.some((p) => p.photo_paths.length > 0);
  const status = usePersonInfo(card.id)?.status ?? null;
  const accent = profileAccent(t, card.profile_color);
  const [sheet, setSheet] = useState<'header' | 'mood' | null>(null);
  const reload = () => onEdited?.();

  const shareProfile = () =>
    Share.share({ message: `${card.is_me ? 'Find me' : `Check out ${card.display_name}`} on I'm In: ${profileLink(card.id)}` }).catch(() => undefined);

  const first = card.display_name.split(' ')[0] ?? '';
  const counts = [
    { n: card.circle_count, one: 'Insider', many: 'Insiders' },
    { n: card.pin_count, one: 'pin', many: 'pins' },
  ].filter((c) => c.n != null);

  return (
    <>
      {/* Header: their own header photo, or a soft blurred take on their picture in their profile color. */}
      <Pressable
        disabled={!card.is_me}
        accessibilityRole={card.is_me ? 'button' : undefined}
        accessibilityLabel={card.is_me ? 'Change your header photo and profile color' : undefined}
        onPress={() => setSheet('header')}
        style={{ marginHorizontal: -t.space[4], marginTop: -t.space[4], height: 150, backgroundColor: `${accent}40`, overflow: 'hidden' }}>
        {card.header_url ? (
          <Image source={{ uri: card.header_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessible={false} />
        ) : card.avatar_url ? (
          <>
            <Image source={{ uri: card.avatar_url }} blurRadius={24} style={{ width: '100%', height: '100%', opacity: 0.7 }} contentFit="cover" accessible={false} />
            <View style={{ position: 'absolute', inset: 0, backgroundColor: `${accent}33` }} />
          </>
        ) : null}
        {card.is_me ? (
          <View
            style={{
              position: 'absolute',
              right: t.space[3],
              top: t.space[3],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: 'rgba(12,12,12,0.6)',
            }}>
            <Ionicons name="color-palette-outline" size={14} color="#F5F5F5" />
            <AppText variant="caption" weight="bold" style={{ color: '#F5F5F5' }}>
              Make it yours
            </AppText>
          </View>
        ) : null}
      </Pressable>

      <View style={{ marginTop: -60, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Pressable
          disabled={!card.is_me}
          accessibilityRole={card.is_me ? 'button' : undefined}
          accessibilityLabel={card.is_me ? 'Change your profile photos' : undefined}
          onPress={() => router.push('/settings/photos')}
          style={{ padding: 4, borderRadius: 40, backgroundColor: t.colors.bg }}>
          <Avatar name={card.display_name} uri={card.avatar_url} size={92} userId={card.id} />
          {card.is_me ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 30,
                height: 30,
                borderRadius: 11,
                backgroundColor: t.colors.primary,
                borderWidth: 2,
                borderColor: t.colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="camera" size={15} color={t.colors.onPrimary} />
            </View>
          ) : null}
        </Pressable>
        {status ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6, borderRadius: 999, borderWidth: 1, borderColor: STATUS_COLORS[status], backgroundColor: t.colors.bg }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLORS[status] }} />
            <AppText variant="caption" weight="bold">
              {STATUS_LABELS[status]}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 6, marginTop: -t.space[2] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space[2] }}>
          <AppText variant="h1" accessibilityRole="header" style={{ fontFamily: t.fonts.displayBold }}>
            {card.display_name}
          </AppText>
          {(card.vouch_count ?? 0) >= FAMOUS_AT ? <Glyph name="star" size={22} color={t.colors.secondary} strokeWidth={2.4} label="1,000+ vouches" /> : null}
          {verified ? <Ionicons name="checkmark-circle" size={20} color={t.colors.trust} accessibilityLabel={card.id_verified ? 'Identity confirmed' : 'Photo verified'} /> : null}
          {card.verified_host ? (
            <AppText variant="small" weight="bold" tone="trust">
              Verified host
            </AppText>
          ) : null}
        </View>
        {[subtitle, card.headline].filter(Boolean).length ? (
          <AppText variant="small" tone="muted">
            {[subtitle, card.headline].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {card.mood || card.is_me ? (
          <Pressable
            disabled={!card.is_me}
            accessibilityRole={card.is_me ? 'button' : 'text'}
            accessibilityLabel={card.is_me ? `Mood: ${card.mood ?? 'none'}. Tap to change` : undefined}
            onPress={() => setSheet('mood')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText style={{ flexShrink: 1 }}>
              <AppText weight="bold" tone="muted">
                Mood:
              </AppText>{' '}
              {card.mood ? card.mood : <AppText tone="subtle">tap to add yours</AppText>}
            </AppText>
            {card.is_me ? <Ionicons name="pencil" size={13} color={t.colors.textSubtle} /> : null}
          </Pressable>
        ) : null}
        {counts.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: t.space[4] }}>
            {counts.map((c) => (
              <AppText key={c.one} variant="small" tone="muted">
                <AppText variant="small" weight="bold" tone="text">
                  {c.n}
                </AppText>{' '}
                {c.n === 1 ? c.one : c.many}
              </AppText>
            ))}
          </View>
        ) : null}
        {/* One or two badges at most: what people vouch them for (or their level), and membership. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {card.notable ? <SpecialSticker label="Notable" /> : null}
          {card.is_official ? <SpecialSticker label="Official" glyph="check" /> : null}
          {card.background_checked ? <SpecialSticker label="Background checked" glyph="shield" /> : null}
          {card.id_verified ? <SpecialSticker label="Identity confirmed" glyph="person" /> : null}
          <MilestoneSticker count={card.vouch_count} />
          {card.top_vouch_word ? <Badge label={card.top_vouch_word} glyph="medal" tone="trust" /> : null}
          {card.is_founding_member ? (
            <Badge label="Founding Member" glyph="star" tone="sponsored" />
          ) : card.is_premium ? (
            <Badge label="Premium" glyph="star" tone="sponsored" />
          ) : null}
        </View>
        {!card.is_me && card.degree ? (
          <AppText variant="small" tone="muted">
            {card.degree === 1
              ? 'Your Insiders'
              : `2nd degree · you both know ${card.via.map((v) => v.display_name).slice(0, 3).join(', ')}`}
          </AppText>
        ) : null}
      </View>

      {card.last_place && !card.is_me ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <Glyph name="pin" size={18} color={t.colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="small" weight="bold">
                Was at {card.last_place.place} {sinceLabel(card.last_place.at)}
              </AppText>
              <AppText variant="caption" tone="subtle">
                Shown only after they leave
              </AppText>
            </View>
          </View>
        </Card>
      ) : null}

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

      {card.is_me ? (
        <StrengthBar input={{ ...card, interests: card.interests }} onFix={(key) => setSheet(key === 'mood' ? 'mood' : 'header')} />
      ) : null}

      {actions}

      {/* Your own profile has Share next to Edit profile. */}
      {!card.is_me ? <Button label="Share profile" size="md" variant="secondary" onPress={shareProfile} /> : null}
      {card.is_me ? (
        <StoryShareButton
          label="Share my profile to my story"
          story={{
            kind: 'profile',
            title: card.display_name,
            line1: card.headline || null,
            line2: card.vouch_count ? `${card.vouch_count} ${card.vouch_count === 1 ? 'vouch' : 'vouches'}${card.top_vouch_word ? ` · ${card.top_vouch_word}` : ''}` : null,
            imageUrl: card.avatar_url,
            path: `/people/${card.id}`,
            mood: card.mood ?? null,
            accent,
            stickers: [
              ...(card.background_checked ? [{ label: 'Background checked', fill: t.colors.trust, ink: t.colors.onTrust }] : []),
              ...(milestoneFor(card.vouch_count) ? [{ label: `${milestoneFor(card.vouch_count)} vouches`, fill: t.colors.trust, ink: t.colors.onTrust }] : []),
              ...(card.top_vouch_word ? [{ label: card.top_vouch_word, fill: t.colors.trust, ink: t.colors.onTrust }] : []),
              ...(card.verified_host ? [{ label: 'Verified host', fill: t.colors.trust, ink: t.colors.onTrust }] : []),
              ...(card.is_founding_member ? [{ label: 'Founding Member', fill: t.colors.secondary, ink: t.colors.onSecondary }] : []),
            ],
          }}
        />
      ) : null}

      <PromptCards prompts={card.prompts} />

      {card.song ? (
        <View style={{ gap: t.space[1] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="muted">
              {card.is_me ? 'Now playing on my page' : `Now playing on ${first}’s page`}
            </AppText>
            {card.is_me ? (
              <AppText variant="caption" tone="primary" weight="bold" onPress={() => router.push('/settings/profile')}>
                Change
              </AppText>
            ) : null}
          </View>
          <MusicChip song={card.song} />
        </View>
      ) : card.is_me ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], padding: t.space[3], borderRadius: t.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.borderStrong }}>
          <Ionicons name="musical-notes-outline" size={18} color={t.colors.textMuted} />
          <AppText variant="small" tone="muted">
            Add the song that plays on your page
          </AppText>
        </Pressable>
      ) : null}

      <LockedIn userId={card.id} isMe={card.is_me} firstName={card.display_name.split(' ')[0] ?? ''} />

      {card.interests?.length ? (
        <Section title="Into">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {card.interests.map((i) => (
              <Badge key={i.key} label={i.label} tone="neutral" />
            ))}
          </View>
        </Section>
      ) : null}

      {card.bio ? (
        <Section title="About">
          <AppText>{card.bio}</AppText>
        </Section>
      ) : null}

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

      {/* Pins / Photos / Vouches, like profile tabs on other apps. */}
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: t.space[5], borderBottomWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
        {(
          [
            { key: 'pins', label: 'Pins' },
            ...(hasPhotos ? [{ key: 'photos', label: 'Photos' }] : []),
            { key: 'vouches', label: 'Vouches' },
          ] as { key: Tab; label: string }[]
        ).map((o) => {
          const on = tab === o.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(o.key)}
              style={{ minHeight: 44, justifyContent: 'flex-end' }}>
              <AppText weight={on ? 'bold' : 'medium'} tone={on ? 'text' : 'muted'} style={{ paddingBottom: 8 }}>
                {o.label}
              </AppText>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: on ? accent : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>

      {tab === 'vouches' ? (
        <VouchList card={card} />
      ) : tab === 'photos' && hasPhotos ? (
        <PhotoGrid pins={pins} />
      ) : pins.length === 0 ? (
        <AppText variant="small" tone="muted">
          No pins you can see yet.
        </AppText>
      ) : (
        <View style={{ gap: t.space[3] }}>
          {pins.map((p) => (
            <PinCard key={p.id} pin={p} onChange={onPinChange} />
          ))}
        </View>
      )}

      {children}

      {card.is_me ? (
        <>
          <HeaderSheet visible={sheet === 'header'} onClose={() => setSheet(null)} userId={card.id} hasHeader={!!card.header_url} color={card.profile_color ?? null} onSaved={reload} />
          <MoodSheet key={card.mood ?? ''} visible={sheet === 'mood'} onClose={() => setSheet(null)} userId={card.id} mood={card.mood ?? null} onSaved={reload} />
        </>
      ) : null}
    </>
  );
}

/**
 * Locked In (our take on a Top 8): the people this person goes out with most,
 * filled in automatically, so nobody ranks their friends. Names and photos
 * only, never where or when. Only their Insiders see it.
 */
function LockedIn({ userId, isMe, firstName }: { userId: string; isMe: boolean; firstName: string }) {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<LockedInPerson[] | null>(null);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLockedIn(userId)
      .then((p) => alive && setPeople(p))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!people || (!people.length && !isMe)) return null;
  return (
    <Section title="Locked In">
      {people.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {people.slice(0, 8).map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="link"
              accessibilityLabel={`${p.display_name}'s profile`}
              onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
              style={{ width: '23%', flexGrow: 1, maxWidth: '25%', alignItems: 'center', gap: 4 }}>
              <SquarePhoto name={p.display_name} uri={p.avatar_url} userId={p.id} />
              <AppText variant="caption" numberOfLines={1}>
                {p.display_name.split(' ')[0]}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : (
        <AppText variant="small" tone="muted">
          The Insiders you go out with most show up here on their own.
        </AppText>
      )}
      {isMe ? (
        <Pressable accessibilityRole="button" onPress={() => setAbout((v) => !v)} hitSlop={6}>
          <AppText variant="caption" tone="subtle">
            {about
              ? 'Filled in from the nights you go out together. Only your Insiders see it, never where you went. Hide it in Settings, Privacy.'
              : 'How does this work?'}
          </AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" tone="subtle">
          Who {firstName} goes out with most.
        </AppText>
      )}
    </Section>
  );
}

/** Who vouched for them, newest first. */
function VouchList({ card }: { card: ProfileCard }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ gap: t.space[3] }}>
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
                  {v.type === 'invite'
                    ? 'Invited them in'
                    : `${v.type === 'contact' ? 'In their contacts' : 'Met in person'} · ${timeAgo(v.created_at)}`}
                </AppText>
              </View>
              {v.word ? <Badge label={v.word} tone="trust" /> : null}
            </Pressable>
          ))
        )}
    </View>
  );
}

/** A full-width rounded-square photo for the Locked In grid. */
function SquarePhoto({ name, uri, userId }: { name: string; uri: string | null; userId: string }) {
  const [w, setW] = useState(0);
  return (
    <View style={{ width: '100%', aspectRatio: 1 }} onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}>
      {w ? <Avatar name={name} uri={uri} size={w} userId={userId} /> : null}
    </View>
  );
}

/** "earlier today", "last night", "on Saturday". */
function sinceLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.getHours() >= 17 ? 'tonight' : 'earlier today';
  if (days === 1) return d.getHours() >= 17 || d.getHours() < 5 ? 'last night' : 'yesterday';
  return `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
}
