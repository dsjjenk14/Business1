import { View } from 'react-native';

import { REQUESTS, ROSTER_BY_ID, CLIENTS, KIKI } from '@/features/in-crowd/engine/content';
import type { FeedPost, GameState, RequestKind } from '@/features/in-crowd/engine/types';

import { ProfilePic } from './Avatar';
import { GameIcon, type IconName } from './Icons';
import { GText, GameButton, IconCircle, ProgressBar, fmtNum, fmtTime } from './Parts';
import { UI } from './palette';

const STREAK_NAMES: Record<string, string> = {
  ...Object.fromEntries((Object.keys(REQUESTS) as RequestKind[]).map((k) => [k, REQUESTS[k].label + 's'])),
  food: 'Food',
  order: 'Orders',
  plate: 'Plates',
  glam: 'Touch-ups',
  trouble: 'Fixes',
};

/** Score against the level's goal, with ticks for each star. */
function GoalBar({ s }: { s: GameState }) {
  const { goal, expert } = s.level;
  const max = expert * 1.08;
  const two = Math.round((goal + expert) / 2);
  const stars = s.score >= expert ? 3 : s.score >= two ? 2 : s.score >= goal ? 1 : 0;
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <GText font="display" size={26} color={stars ? UI.gold : UI.text}>
          {fmtNum(Math.max(0, s.score))}
        </GText>
        <View style={{ flexDirection: 'row', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <GameIcon key={i} name={i <= stars ? 'star' : 'starEmpty'} size={13} />
          ))}
        </View>
      </View>
      <View>
        <ProgressBar value={Math.max(0, s.score) / max} color={stars ? UI.gold : UI.pink} height={7} />
        {[goal, two, expert].map((v, i) => (
          <View key={i} style={{ position: 'absolute', left: `${(v / max) * 100}%`, top: -2, width: 2, height: 11, backgroundColor: '#FFFFFF', opacity: 0.8 }} />
        ))}
      </View>
      <GText size={9.5} color={UI.muted}>
        Goal {fmtNum(goal)} · Expert {fmtNum(expert)}
      </GText>
    </View>
  );
}

export function PartyHud({ s, onPause }: { s: GameState; onPause: () => void }) {
  const left = s.level.duration - s.time;
  const hurry = left <= 15;
  const blink = Math.floor(s.clock * 3) % 2 === 0;
  const streakMult = Math.min(3, 1 + 0.25 * (s.streak.n - 1));
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconCircle icon="pause" label="Pause" onPress={onPause} size={40} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            height: 40,
            borderRadius: 14,
            backgroundColor: hurry && blink ? '#5A0B16' : UI.panel2,
            borderWidth: 1.5,
            borderColor: hurry ? UI.red : UI.line,
          }}>
          <GameIcon name="clock" size={18} />
          <GText font="display" size={26} color={hurry ? UI.red : UI.text} style={{ minWidth: 44 }}>
            {fmtTime(left)}
          </GText>
        </View>
        <GoalBar s={s} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <GameIcon name={s.viral > 0 ? 'rocket' : 'vibe'} size={18} />
          <View style={{ flex: 1 }}>
            <ProgressBar value={s.viral > 0 ? s.viral / 10 : s.vibe / 100} color={s.viral > 0 ? UI.gold : UI.cyan} height={8} />
          </View>
          <GText font="black" size={10} color={s.viral > 0 ? UI.gold : UI.muted}>
            {s.viral > 0 ? `VIRAL ${Math.ceil(s.viral)}s` : 'VIBE'}
          </GText>
        </View>
        {s.streak.n >= 2 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: 'rgba(255,77,141,0.22)', borderWidth: 1, borderColor: UI.pink }}>
            <GameIcon name="flame" size={14} />
            <GText font="black" size={10.5} color={UI.text}>
              ×{streakMult.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')} {STREAK_NAMES[s.streak.cat] ?? ''}
            </GText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function SeatingHud({ s, onStart, onPause, seatedAll }: { s: GameState; onStart: () => void; onPause: () => void; seatedAll: boolean }) {
  const hearts = s.guests.reduce((sum, g) => sum + (g.seat >= 0 && !g.late ? g.mood : 0), 0);
  const max = s.guests.filter((g) => !g.late).length * 5;
  const low = s.seatingLeft <= 10;
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconCircle icon="pause" label="Pause" onPress={onPause} size={40} />
        <View style={{ flex: 1 }}>
          <GText font="black" size={16} lines={1}>
            Seat the guest list
          </GText>
          <GText size={11} color={UI.muted} lines={1}>
            Doors open in{' '}
            <GText font="black" size={11} color={low ? UI.red : UI.gold}>
              {fmtTime(s.seatingLeft)}
            </GText>
            {'  ·  '}+4 clout for every second left
          </GText>
        </View>
        <GameButton label={seatedAll ? 'Open doors' : 'Start now'} icon="play" size="sm" tone={seatedAll ? 'gold' : 'dark'} onPress={onStart} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <GameIcon name="heart" size={16} />
        <View style={{ flex: 1 }}>
          <ProgressBar value={max ? hearts / max : 0} color={UI.pink} height={8} />
        </View>
        <GText font="black" size={11} color={UI.text}>
          {hearts % 1 ? hearts.toFixed(1) : hearts} / {max} hearts
        </GText>
      </View>
    </View>
  );
}

/** A big message across the top of the room. */
export function Banner({ text, tone, icon }: { text: string; tone: 'live' | 'warn' | 'good' | 'info'; icon?: IconName }) {
  const bg = { live: UI.live, warn: '#7A4A00', good: '#1E5E3A', info: UI.panel3 }[tone];
  const border = { live: '#FFB3C0', warn: UI.gold, good: UI.green, info: UI.line }[tone];
  return (
    <View
      pointerEvents="none"
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor: border,
        maxWidth: '94%',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
      }}>
      {icon ? <GameIcon name={icon} size={22} /> : null}
      <GText font="black" size={13.5} lines={2} style={{ flexShrink: 1 }}>
        {text}
      </GText>
    </View>
  );
}

function posterLook(handle: string) {
  const all = [...Object.values(ROSTER_BY_ID), ...Object.values(CLIENTS), KIKI];
  return all.find((p) => p.handle === handle) ?? null;
}

/** The live feed: what everybody is posting about your party. */
export function FeedTicker({ feed }: { feed: FeedPost[] }) {
  const post = feed[feed.length - 1];
  if (!post) return <View style={{ height: 40 }} />;
  const who = posterLook(post.handle);
  const color = post.tone === 'bad' ? UI.red : post.tone === 'news' ? UI.cyan : UI.green;
  return (
    <View
      style={{
        height: 40,
        marginHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(26,20,36,0.92)',
        borderWidth: 1,
        borderColor: UI.line,
      }}>
      {who ? (
        <ProfilePic look={who.look} size={26} id={`feed-${post.id}`} ring={color} />
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: UI.panel3, alignItems: 'center', justifyContent: 'center' }}>
          <GameIcon name="phone" size={16} />
        </View>
      )}
      <GText size={11.5} color={UI.text} lines={2} style={{ flex: 1 }}>
        <GText font="black" size={11.5} color={color}>
          {post.handle}{' '}
        </GText>
        {post.text}
      </GText>
    </View>
  );
}
