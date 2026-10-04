import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { STATIONS } from '@/features/in-crowd/engine/content';
import { previewMood, queueOrder } from '@/features/in-crowd/engine/game';
import { BIN, ENTRANCE, ROUTER, STAGE, TABLE_SLOTS, WORLD } from '@/features/in-crowd/engine/layout';
import type { GameState, Guest, Look, Seat, Target, Vec } from '@/features/in-crowd/engine/types';

import { Avatar, expressionFor } from './Avatar';
import { GameIcon, type IconName } from './Icons';
import { Bubble, GText, IconBubble, PatienceMeter, requestIcon, textGlow } from './Parts';
import { FONT, UI, VENUES } from './palette';
import { PlaceSetting, PlannerSprite, StationSprite, TableSprite, TroubleSprite, type Outfit } from './Sprites';
import { Bins, Entrance, Router, SlotDecor, Stage, VenueBackdrop } from './Venue';

/**
 * Draws one frame of a night from the game state. Everything static is
 * memoized, so a frame mostly moves a few views around.
 *
 * Depth: things lower on the board are drawn in front (zIndex = y).
 */
type Props = {
  s: GameState;
  selected: string | null;
  onSeat: (seat: number) => void;
  onTap: (target: Target) => void;
  onLate: (guestId: string) => void;
  /** The planner you play as, dressed from the Closet. */
  planner: { look: Look; outfit: Outfit };
};

const OVERLAY = 2000;

function at(x: number, y: number, w: number, h: number, z = 0) {
  return { position: 'absolute' as const, left: x, top: y, width: w, height: h, zIndex: z };
}

function urgency(g: Guest): 0 | 1 | 2 {
  return g.mood < 1.6 ? 2 : g.mood < 3 ? 1 : 0;
}

const Chair = memo(function Chair({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 30,
        height: 34,
        borderTopLeftRadius: 13,
        borderTopRightRadius: 13,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        backgroundColor: color,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.35)',
      }}
    />
  );
});

function SeatedGuest({ g, seat, s, selected, seating, onPress }: { g: Guest | undefined; seat: Seat; s: GameState; selected: boolean; seating: boolean; onPress: () => void }) {
  const v = VENUES[s.chapter.venue];
  const table = s.tables[seat.table];
  const tableY = table?.pos.y ?? seat.pos.y + 22;
  const showGuest = g && g.seat === seat.id && g.state !== 'walking' && g.state !== 'leaving' && g.state !== 'gone';
  const shake = g && g.shake > 0 ? Math.sin(g.shake * 40) * 2.5 : 0;
  const bob = g && g.love > 0 ? -Math.abs(Math.sin(g.love * 9)) * 3 : 0;
  const expr = g ? expressionFor(g.mood, { love: g.love > 0, drama: g.drama !== null, shake: g.shake > 0 }) : 'ok';
  return (
    <>
      <View pointerEvents="none" style={at(seat.pos.x - 15, seat.pos.y - 12, 30, 34, tableY - 40)}>
        <Chair color={v.chair} />
      </View>
      {showGuest && g ? (
        <View pointerEvents="none" style={[at(seat.pos.x - 20 + shake, seat.pos.y - 28 + bob, 40, 47, tableY - 30)]}>
          <Avatar look={g.profile.look} expr={expr} size={40} id={g.id} />
        </View>
      ) : null}
      {seating && !showGuest ? (
        <View
          pointerEvents="none"
          style={[
            at(seat.pos.x - 14, seat.pos.y - 16, 28, 28, tableY - 29),
            { borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: selected ? UI.gold : 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
          ]}>
          <GText font="black" size={16}>
            +
          </GText>
        </View>
      ) : null}
      {selected ? (
        <View
          pointerEvents="none"
          style={[at(seat.pos.x - 22, seat.pos.y - 32, 44, 52, tableY - 31), { borderRadius: 16, borderWidth: 3, borderColor: UI.gold, backgroundColor: 'rgba(255,209,102,0.18)' }]}
        />
      ) : null}
      <View style={at(seat.pos.x - 15, tableY - 14, 30, 14, tableY + 2)} pointerEvents="none">
        <PlaceSetting dish={g?.state === 'eating' ? (g.meal ?? undefined) : undefined} eating={g?.state === 'eating'} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g ? `${g.profile.name}${g.request ? `, wants ${g.request.kind}` : ''}` : `Empty seat`}
        onPress={onPress}
        style={at(seat.pos.x - 19, seat.pos.y - 34, 38, 96, OVERLAY - 10)}
      />
    </>
  );
}

function troubleBox(t: GameState['troubles'][number]) {
  const w = t.kind === 'drama' || t.kind === 'spill' ? 56 : 44;
  const h = t.kind === 'paparazzi' ? 70 : t.kind === 'troll' ? 50 : t.kind === 'spill' ? 26 : 30;
  const z = t.kind === 'spill' ? 3 : t.kind === 'drama' ? OVERLAY + 2 : Math.round(t.pos.y) + 5;
  const y = t.kind === 'spill' ? t.pos.y - 13 : t.kind === 'drama' ? t.pos.y - 15 : t.pos.y - h + 4;
  return { x: t.pos.x - w / 2, y, w, h, z };
}

function targetPoint(s: GameState, t: Target): Vec | null {
  switch (t.kind) {
    case 'station': {
      const st = s.stations.find((x) => x.kind === t.station);
      return st ? { x: st.pos.x + 22, y: st.pos.y - 34 } : null;
    }
    case 'seat': {
      const seat = s.seats[t.seat];
      return seat ? { x: seat.pos.x + 15, y: seat.pos.y - 26 } : null;
    }
    case 'trouble': {
      const tr = s.troubles.find((x) => x.id === t.id);
      return tr ? { x: tr.pos.x + 16, y: tr.pos.y - 40 } : null;
    }
    case 'stage':
      return { x: STAGE.x + 44, y: STAGE.y - 40 };
    case 'bin':
      return { x: BIN.x + 26, y: BIN.y - 40 };
    case 'router':
      return { x: ROUTER.x + 20, y: ROUTER.y - 34 };
  }
}

function itemIcon(item: GameState['player']['hands'][number]): IconName {
  if (item.kind === 'dish') return item.dish;
  if (item.kind === 'plate') return 'plate';
  return requestIcon(item.kind);
}

export function Scene({ s, selected, onSeat, onTap, onLate, planner }: Props) {
  const venue = VENUES[s.chapter.venue];
  const seating = s.phase === 'seating';
  const p = s.player;
  const blink = Math.floor(s.clock * 4) % 2 === 0;
  const walking = p.path.length > 0;
  const walkFrame = walking ? (Math.floor(p.stride / 16) % 2 ? 1 : 2) : 0;
  const usedSlots = new Set(s.tables.map((t) => t.slot));
  const queue = s.phase === 'party' ? queueOrder(s) : [];
  const wifiDown = s.troubles.some((t) => t.kind === 'wifi' && t.active);
  const blackout = s.troubles.some((t) => t.kind === 'blackout' && t.active);
  const kitchen = s.stations.find((st) => st.kind === 'kitchen');

  return (
    <View style={{ width: WORLD.w, height: WORLD.h, overflow: 'hidden' }}>
      <View pointerEvents="none" style={at(0, 0, WORLD.w, WORLD.h, 0)}>
        <VenueBackdrop venue={s.chapter.venue} />
      </View>

      {/* Empty table slots get venue decor */}
      {TABLE_SLOTS.map((slot, i) =>
        usedSlots.has(i) ? null : (
          <View key={`decor-${i}`} pointerEvents="none" style={at(slot.x - 88, slot.y - 70, 176, 120, 1)}>
            <SlotDecor venue={s.chapter.venue} slot={i} />
          </View>
        ),
      )}

      {/* Counters */}
      {s.stations.map((st) => (
        <Pressable
          key={st.kind}
          accessibilityRole="button"
          accessibilityLabel={STATIONS[st.kind].label}
          onPress={() => onTap({ kind: 'station', station: st.kind })}
          style={at(st.pos.x - 32, st.pos.y - 46, 64, 96, 20)}>
          <StationSprite kind={st.kind} venue={venue} />
          <View style={{ position: 'absolute', left: 1, right: 1, top: 70, paddingVertical: 2, borderRadius: 6, backgroundColor: venue.label, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' }}>
            <GText font="black" size={8.5} color={venue.labelText} align="center" lines={1}>
              {STATIONS[st.kind].short.toUpperCase()}
            </GText>
          </View>
        </Pressable>
      ))}

      {/* Kitchen pass: dishes ready, and what's cooking (one row, so it never covers a guest) */}
      {kitchen ? (
        <View pointerEvents="none" style={[at(kitchen.pos.x - 34, kitchen.pos.y + 50, 120, 20, OVERLAY - 20), { flexDirection: 'row', gap: 1 }]}>
          {s.kitchen.ready.map((d, i) => (
            <View key={`r${i}`} style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: UI.green }}>
              <GameIcon name={d} size={15} />
            </View>
          ))}
          {s.kitchen.cooking.slice(0, Math.max(0, 6 - s.kitchen.ready.length)).map((c, i) => (
            <View key={`c${i}`} style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(1 - Math.max(0, c.left) / c.total) * 100}%`, backgroundColor: 'rgba(255,209,102,0.55)' }} />
              <GameIcon name={c.dish} size={12} />
            </View>
          ))}
        </View>
      ) : null}

      {kitchen && s.chefGone > 0 ? (
        <View pointerEvents="none" style={[at(kitchen.pos.x - 34, kitchen.pos.y - 30, 70, 30, OVERLAY + 6), { alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(14,11,20,0.88)', borderWidth: 1.5, borderColor: UI.red }]}>
          <GText font="black" size={8.5} color={UI.red} align="center">
            CHEF ON BREAK
          </GText>
          <GText font="black" size={10} align="center">
            {Math.ceil(s.chefGone)}s
          </GText>
        </View>
      ) : null}

      {/* Tables, chairs and guests */}
      {s.tables.map((t) => (
        <View key={`table-${t.id}`} pointerEvents="none" style={at(t.pos.x - 84, t.pos.y - 18, 168, 52, t.pos.y)}>
          <TableSprite venue={venue} id={t.id} />
        </View>
      ))}
      {s.seats.map((seat) => (
        <SeatedGuest
          key={`seat-${seat.id}`}
          seat={seat}
          s={s}
          g={s.guests.find((g) => g.id === seat.guest)}
          selected={!!selected && seat.guest === selected}
          seating={seating}
          onPress={() => onSeat(seat.id)}
        />
      ))}

      {/* Guests on the move (late arrivals walking in, unfollowers walking out) */}
      {s.guests
        .filter((g) => g.state === 'walking' || g.state === 'leaving')
        .map((g) => (
          <View key={`walk-${g.id}`} pointerEvents="none" style={[at(g.pos.x - 18, g.pos.y - 30, 36, 42, Math.round(g.pos.y) + 10), { opacity: g.state === 'leaving' ? 0.85 : 1 }]}>
            <Avatar look={g.profile.look} expr={g.state === 'leaving' ? 'mad' : 'happy'} size={36} id={`${g.id}-w`} />
          </View>
        ))}

      {/* Front of house */}
      <View pointerEvents="none" style={at(ENTRANCE.x - 34, ENTRANCE.y - 46, 70, 100, 640)}>
        <Entrance venue={s.chapter.venue} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Router" onPress={() => onTap({ kind: 'router' })} style={at(ROUTER.x - 26, ROUTER.y - 30, 52, 44, 660)}>
        <Router down={wifiDown || blackout} blink={blink} />
      </Pressable>
      {wifiDown || blackout ? (
        <View pointerEvents="none" style={[at(ROUTER.x - 15, ROUTER.y - 66, 30, 34, OVERLAY + 4), { transform: [{ scale: blink ? 1.12 : 1 }] }]}>
          <IconBubble icon={blackout ? 'blackout' : 'wifi'} rim={UI.red} />
        </View>
      ) : null}
      {blackout ? <View pointerEvents="none" style={[at(0, 0, WORLD.w, WORLD.h, OVERLAY - 2), { backgroundColor: '#05030A', opacity: blink ? 0.6 : 0.66 }]} /> : null}
      {s.sponsor > 0 ? (
        <View pointerEvents="none" style={[at(0, 0, WORLD.w, WORLD.h, OVERLAY + 49), { borderWidth: 6, borderColor: UI.gold, opacity: blink ? 0.9 : 0.5, borderRadius: 18 }]} />
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Live stage" onPress={() => onTap({ kind: 'stage' })} style={at(STAGE.x - 60, STAGE.y - 42, 120, 96, 650)}>
        <Stage state={s.live.state} host={s.chapter.client.look} hostId={s.chapter.client.id} pulse={blink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Recycling" onPress={() => onTap({ kind: 'bin' })} style={at(BIN.x - 35, BIN.y - 40, 70, 76, 650)}>
        <Bins />
      </Pressable>

      {/* Late guests at the rope */}
      {s.lateQueue.map((id) => {
        const g = s.guests.find((x) => x.id === id);
        if (!g) return null;
        const isSel = s.selected === id;
        return (
          <Pressable
            key={`late-${id}`}
            accessibilityRole="button"
            accessibilityLabel={`${g.profile.name} is waiting at the rope`}
            onPress={() => onLate(id)}
            style={[
              at(g.pos.x - 24, g.pos.y - 62, 48, 84, OVERLAY + 5),
              { alignItems: 'center', borderRadius: 14, borderWidth: isSel ? 3 : 0, borderColor: UI.gold, backgroundColor: isSel ? 'rgba(255,209,102,0.25)' : 'transparent' },
            ]}>
            <View style={{ transform: [{ scale: blink && !isSel ? 1.08 : 1 }] }}>
              <IconBubble icon={g.vip ? 'sparkle' : 'seat'} rim={g.mood < 1.6 ? UI.red : g.vip ? UI.pink : UI.gold} size={26} />
            </View>
            {g.vip ? (
              <View style={{ position: 'absolute', bottom: -2, paddingHorizontal: 4, borderRadius: 4, backgroundColor: UI.pink }}>
                <GText font="black" size={7.5}>
                  VIP
                </GText>
              </View>
            ) : null}
            <PatienceMeter value={Math.ceil(g.mood * 4) / 4} blink={g.mood < 1.6 && !blink} />
            <Avatar look={g.profile.look} expr={expressionFor(g.mood)} size={36} id={`${g.id}-late`} />
          </Pressable>
        );
      })}

      {/* Trouble: drawn at its depth, tapped from the top layer */}
      {s.troubles.map((t) => {
        if (t.kind === 'wifi') return null;
        const box = troubleBox(t);
        return (
          <View key={`trouble-${t.id}`} pointerEvents="none" style={at(box.x, box.y, box.w, box.h, box.z)}>
            <TroubleSprite kind={t.kind} frame={blink ? 1 : 0} />
          </View>
        );
      })}
      {s.troubles.map((t) => {
        if (t.kind === 'wifi' || t.leaving) return null;
        const box = troubleBox(t);
        return (
          <Pressable
            key={`trouble-tap-${t.id}`}
            accessibilityRole="button"
            accessibilityLabel={t.kind}
            onPress={() => onTap({ kind: 'trouble', id: t.id })}
            hitSlop={10}
            style={at(box.x, box.y, box.w, box.h, OVERLAY - 5)}
          />
        );
      })}

      {/* The planner */}
      <View pointerEvents="none" style={at(p.pos.x - 24, p.pos.y - 76, 48, 80, Math.round(p.pos.y))}>
        <View style={{ transform: [{ scaleX: p.facing }] }}>
          <PlannerSprite look={planner.look} outfit={planner.outfit} frame={walkFrame} busy={!!p.busy} />
        </View>
      </View>
      {p.hands.length ? (
        <View pointerEvents="none" style={[at(p.pos.x - 46, p.pos.y - 104, 92, 26, OVERLAY + 30), { flexDirection: 'row', justifyContent: 'center', gap: 2 }]}>
          {p.hands.map((item, i) => (
            <View key={i} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: UI.pink }}>
              <GameIcon name={itemIcon(item)} size={18} />
            </View>
          ))}
        </View>
      ) : null}
      {p.busy ? (
        <View pointerEvents="none" style={[at(p.pos.x - 36, p.pos.y - (p.hands.length ? 128 : 102), 72, 22, OVERLAY + 31), { alignItems: 'center' }]}>
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(14,11,20,0.85)', overflow: 'hidden', minWidth: 60 }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(1 - p.busy.left / p.busy.total) * 100}%`, backgroundColor: UI.pink, opacity: 0.6 }} />
            <GText font="black" size={10} align="center">
              {p.busy.label}
            </GText>
          </View>
        </View>
      ) : null}

      {/* Bubbles and hearts over everything */}
      {s.seats.map((seat) => {
        const g = s.guests.find((x) => x.id === seat.guest);
        if (!g || g.state === 'walking' || g.state === 'leaving' || g.state === 'gone') return null;
        const danger = g.mood < 1.6 && s.phase === 'party';
        const pulse = danger && blink ? 1.12 : 1;
        return (
          <View key={`hud-${seat.id}`} pointerEvents="none" style={[at(seat.pos.x - 26, seat.pos.y - 88, 52, 62, OVERLAY), { alignItems: 'center', justifyContent: 'flex-end' }]}>
            {g.request && !seating ? (
              <View style={{ transform: [{ scale: pulse }] }}>
                <Bubble kind={g.request.kind} dish={g.request.dish} level={urgency(g)} size={30} />
              </View>
            ) : null}
            {g.state === 'eating' && !seating ? (
              <View style={{ paddingHorizontal: 5, borderRadius: 6, backgroundColor: 'rgba(14,11,20,0.7)', marginBottom: 2 }}>
                <GText font="bold" size={9} color={UI.gold}>
                  eating
                </GText>
              </View>
            ) : null}
            <PatienceMeter value={Math.ceil(g.mood * 4) / 4} blink={danger && !blink} />
          </View>
        );
      })}

      {/* Seating preview: how happy the picked guest would be in each seat */}
      {seating && selected
        ? s.seats.map((seat) => {
            if (seat.guest === selected) return null;
            const h = previewMood(s, selected, seat.id);
            const color = h >= 4 ? UI.green : h >= 3 ? UI.gold : UI.red;
            return (
              <View
                key={`pv-${seat.id}`}
                pointerEvents="none"
                style={[
                  at(seat.pos.x - 15, seat.pos.y + 4, 30, 18, OVERLAY + 3),
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 9, backgroundColor: 'rgba(14,11,20,0.85)', borderWidth: 1.5, borderColor: color },
                ]}>
                <GameIcon name="heart" size={10} />
                <GText font="black" size={10} color={color}>
                  {h % 1 ? h.toFixed(1) : h}
                </GText>
              </View>
            );
          })
        : null}

      {/* Drama bolts between beefing guests */}
      {s.troubles
        .filter((t) => t.kind === 'drama')
        .flatMap((t) =>
          t.guests.map((id) => {
            const g = s.guests.find((x) => x.id === id);
            if (!g) return null;
            return (
              <View key={`beef-${t.id}-${id}`} pointerEvents="none" style={at(g.pos.x - 10, g.pos.y - 46, 20, 20, OVERLAY + 1)}>
                <GameIcon name="drama" size={20} />
              </View>
            );
          }),
        )}

      {/* Your queue */}
      {queue.map(({ target, n }, i) => {
        const pt = targetPoint(s, target);
        if (!pt) return null;
        const same = queue.slice(0, i).filter((q) => JSON.stringify(q.target) === JSON.stringify(target)).length;
        return (
          <View
            key={`q-${i}`}
            pointerEvents="none"
            style={[
              at(pt.x - 9 + same * 12, pt.y - 9, 18, 18, OVERLAY + 40),
              { borderRadius: 9, backgroundColor: n === 1 ? UI.pink : UI.panel3, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
            ]}>
            <GText font="black" size={10}>
              {n}
            </GText>
          </View>
        );
      })}

      {/* Viral confetti */}
      {s.viral > 0
        ? Array.from({ length: 26 }, (_, i) => {
            const x = (i * 53 + s.clock * 26 * ((i % 3) + 1)) % WORLD.w;
            const y = (i * 97 + s.clock * 140 * (1 + (i % 4) * 0.25)) % WORLD.h;
            return (
              <View
                key={`cf-${i}`}
                pointerEvents="none"
                style={[
                  at(x, y, 6, 10, OVERLAY + 50),
                  { backgroundColor: [UI.pink, UI.gold, UI.cyan, UI.green][i % 4], borderRadius: 1.5, transform: [{ rotate: `${(s.clock * 220 + i * 40) % 360}deg` }] },
                ]}
              />
            );
          })
        : null}

      {/* Floating clout, flashes, hearts */}
      {s.fx.map((f) => {
        const t = f.age / f.ttl;
        if (f.kind === 'text') {
          const big = !!f.big;
          return (
            <View key={f.id} pointerEvents="none" style={[at(f.pos.x - 90, f.pos.y - (big ? 24 : 12) - f.age * (big ? 22 : 38), 180, big ? 40 : 22, OVERLAY + 60), { alignItems: 'center', opacity: 1 - t * t }]}>
              <GText
                font={big ? 'display' : 'black'}
                size={big ? 34 : 15}
                color={f.color}
                style={[{ fontFamily: big ? FONT.display : FONT.black }, textGlow('rgba(0,0,0,0.85)', 4, 1.5)]}>
                {f.text}
              </GText>
            </View>
          );
        }
        if (f.kind === 'flash') {
          return (
            <View key={f.id} pointerEvents="none" style={[at(f.pos.x - 34, f.pos.y - 34, 68, 68, OVERLAY + 55), { borderRadius: 34, backgroundColor: '#FFFFFF', opacity: (1 - t) * 0.85 }]} />
          );
        }
        if (f.kind === 'hearts') {
          return (
            <View key={f.id} pointerEvents="none" style={[at(f.pos.x - 30, f.pos.y - 20 - t * 30, 60, 20, OVERLAY + 52), { flexDirection: 'row', justifyContent: 'space-between', opacity: 1 - t }]}>
              <GameIcon name="heart" size={12} />
              <View style={{ marginTop: -8 }}>
                <GameIcon name="heart" size={14} />
              </View>
              <GameIcon name="heart" size={12} />
            </View>
          );
        }
        return null;
      })}
    </View>
  );
}

