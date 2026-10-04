import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { NICHES, ROSTER_BY_ID, TRAITS, formatFollowers } from '@/features/celeb-dash/engine/content';
import type { Profile } from '@/features/celeb-dash/engine/types';

import { ProfilePic } from './Avatar';
import { GameIcon } from './Icons';
import { GText, NicheChip } from './Parts';
import { UI } from './palette';

/**
 * Everything you need to seat someone well: niche, who they get along
 * with, who they can't stand, and what kind of guest they are.
 */
export const GuestCard = memo(function GuestCard({
  profile,
  selected,
  seatedHearts,
  onPress,
  width = 158,
  showBio,
}: {
  profile: Profile;
  selected?: boolean;
  seatedHearts?: number | null;
  onPress?: () => void;
  width?: number;
  showBio?: boolean;
}) {
  const n = NICHES[profile.niche];
  const likes = profile.likes ?? n.likes;
  const dislikes = profile.dislikes ?? n.dislikes;
  const bff = profile.bff ? ROSTER_BY_ID[profile.bff] : null;
  const rival = profile.rival ? ROSTER_BY_ID[profile.rival] : null;
  const seated = seatedHearts !== undefined && seatedHearts !== null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${profile.name}, ${n.label}${selected ? ', selected' : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width,
        padding: 10,
        gap: 6,
        borderRadius: 16,
        backgroundColor: selected ? '#3A2A12' : UI.panel2,
        borderWidth: 2,
        borderColor: selected ? UI.gold : seated ? 'rgba(124,242,156,0.45)' : UI.line,
        opacity: pressed ? 0.85 : 1,
        transform: [{ translateY: selected ? -4 : 0 }],
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ProfilePic look={profile.look} size={38} id={`card-${profile.id}`} ring={n.color} />
        <View style={{ flex: 1 }}>
          <GText font="black" size={12.5} lines={1}>
            {profile.name}
          </GText>
          <GText font="semi" size={10} color={UI.muted} lines={1}>
            {profile.handle}
          </GText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <NicheChip niche={profile.niche} small />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <GameIcon name="follower" size={12} />
          <GText font="black" size={10.5} color={UI.cyan}>
            {formatFollowers(profile.followers)}
          </GText>
        </View>
        {profile.trait !== 'none' ? (
          <GText font="bold" size={9.5} color={profile.trait === 'diva' ? UI.pink : UI.gold}>
            {TRAITS[profile.trait].label}
          </GText>
        ) : null}
      </View>
      {showBio ? (
        <GText size={11} color={UI.muted}>
          {profile.bio}
        </GText>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
        {likes.map((l) => (
          <NicheChip key={`l-${l}`} niche={l} sign="+" small />
        ))}
        {dislikes.map((d) => (
          <NicheChip key={`d-${d}`} niche={d} sign="−" small />
        ))}
      </View>
      {bff || rival ? (
        <View style={{ gap: 1 }}>
          {bff ? (
            <GText font="bold" size={9.5} color={UI.green} lines={1}>
              BFF: {bff.name}
            </GText>
          ) : null}
          {rival ? (
            <GText font="bold" size={9.5} color={UI.red} lines={1}>
              Rival: {rival.name}
            </GText>
          ) : null}
        </View>
      ) : null}
      {seated ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <GText font="black" size={10} color={UI.green}>
            Seated
          </GText>
          <GameIcon name="heart" size={11} />
          <GText font="black" size={10} color={UI.text}>
            {seatedHearts % 1 ? seatedHearts.toFixed(1) : seatedHearts}
          </GText>
        </View>
      ) : null}
    </Pressable>
  );
});
