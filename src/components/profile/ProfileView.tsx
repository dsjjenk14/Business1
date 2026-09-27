import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { PinCard } from '@/components/pins/PinCard';
import { AppText, Avatar, Badge, Card, GlyphTile, isGlyphName, Section } from '@/components/ui';
import { tierProgress, useAppConfig } from '@/config/useAppConfig';
import type { FeedPin } from '@/features/pins/api';
import type { ProfileCard } from '@/features/profiles/api';
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space[2] }}>
          {card.top_vouch_word ? <Badge label={`${card.top_vouch_word}${card.city_name ? ` · ${shortCity(card.city_name)}` : ''}`} glyph="medal" tone="trust" /> : null}
          {current ? <Badge label={current.name} glyph={isGlyphName(current.emoji) ? current.emoji : 'medal'} tone="trust" /> : null}
          {card.is_founding_member ? <Badge label="Founding Member" glyph="star" tone="sponsored" /> : null}
          {card.is_premium ? <Badge label="Premium" glyph="star" tone="sponsored" /> : null}
          {card.id_verified ? <Badge label="ID Verified" glyph="check" tone="ai" verified /> : null}
        </View>
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
          { n: card.groups.length, label: 'Groups', tone: 'ai' as const },
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

      <Section title="Pins">
        {pins.length === 0 ? (
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
      </Section>

      {children}
    </>
  );
}
