import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText, Button } from '@/components/ui';
import type { HomeEvent } from '@/features/home/api';
import { money } from '@/features/payments/api';
import type { HotSpot } from '@/features/trending/api';
import { MARKET_TIMEZONE } from '@/lib/time';
import { fontStyle, useTheme } from '@/theme';

const INK = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.72)';
const FAINT = 'rgba(255,255,255,0.1)';

/**
 * The top of Home: a night-out poster for What's In. A big wordmark over a
 * glow in the app's color, a strip of the hottest spots right now, and the
 * trending events as cards you can swipe and say I'm In to.
 */
export function WhatsInHero({ events, spots, onIn }: { events: HomeEvent[]; spots: HotSpot[]; onIn: (e: HomeEvent) => void }) {
  const t = useTheme();
  const router = useRouter();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tonight = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: MARKET_TIMEZONE });

  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: '#121016' }}>
      {size.w ? (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute' }} pointerEvents="none">
          <Defs>
            <RadialGradient id="glow" cx="85%" cy="0%" r="75%">
              <Stop offset="0" stopColor={t.colors.primary} stopOpacity={0.75} />
              <Stop offset="1" stopColor={t.colors.primary} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.55" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
            </LinearGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#glow)" />
          <Rect width={size.w} height={size.h} fill="url(#floor)" />
        </Svg>
      ) : null}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="What's In: trending events, hot spots and posts near you. See all"
        onPress={() => router.push('/whats-in')}
        style={({ pressed }) => ({ padding: t.space[4], paddingBottom: t.space[3], gap: t.space[2], opacity: pressed ? 0.85 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.primary }} />
          <AppText variant="caption" weight="bold" style={{ color: SOFT, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {tonight} night · near you
          </AppText>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: FAINT }}>
            <AppText variant="caption" weight="bold" style={{ color: INK }}>
              See all
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={INK} />
          </View>
        </View>
        <AppText
          accessibilityRole="header"
          style={{ ...fontStyle(t.fonts.displayBold), color: INK, fontSize: 44, lineHeight: 46, letterSpacing: -0.5, textTransform: 'uppercase' }}>
          What&apos;s In
        </AppText>
        <AppText variant="small" style={{ color: SOFT }}>
          {events.length || spots.length
            ? `${[spots.length ? `${spots.length} hot spot${spots.length === 1 ? '' : 's'}` : null, events.length ? `${events.length} trending event${events.length === 1 ? '' : 's'}` : null]
                .filter(Boolean)
                .join(' · ')}. Where the night is going.`
            : 'Where the night is going. Check back once people start heading out.'}
        </AppText>
      </Pressable>

      {spots.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2], paddingHorizontal: t.space[4], paddingBottom: t.space[3] }}>
          {spots.map((s, i) => (
            <Pressable
              key={s.venue_id}
              accessibilityRole="link"
              accessibilityLabel={`Number ${i + 1} tonight: ${s.name}, ${s.people} people in`}
              onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(s.venue_id) } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: FAINT }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primary }}>
                <AppText variant="caption" weight="bold" style={{ color: t.colors.onPrimary }}>
                  {i + 1}
                </AppText>
              </View>
              <AppText variant="small" weight="bold" style={{ color: INK }} numberOfLines={1}>
                {s.name}
              </AppText>
              <AppText variant="caption" style={{ color: SOFT }}>
                {s.friends ? `${s.friends} Insider${s.friends === 1 ? '' : 's'}` : `${s.people} in`}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {events.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={232}
          decelerationRate="fast"
          contentContainerStyle={{ gap: t.space[3], paddingHorizontal: t.space[4], paddingBottom: t.space[4] }}>
          {events.map((e) => (
            <EventPoster key={e.id} event={e} onIn={() => onIn(e)} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: t.space[2] }} />
      )}
    </View>
  );
}

function EventPoster({ event, onIn }: { event: HomeEvent; onIn: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const d = new Date(event.starts_at);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-US', { ...o, timeZone: MARKET_TIMEZONE });
  const open = () => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } });
  const full = event.capacity != null && event.going_count >= event.capacity;
  const who = event.friends_going ? `${event.friends_going} Insider${event.friends_going === 1 ? '' : 's'} going` : `${event.going_count} going`;

  return (
    <View style={{ width: 220, borderRadius: t.radius.md, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: t.space[3], gap: t.space[2] }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${event.title}, ${part({ weekday: 'long', hour: 'numeric', minute: '2-digit' })}, ${who}`} onPress={open} style={{ gap: t.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <AppText style={{ ...fontStyle(t.fonts.displayBold), color: INK, fontSize: 30, lineHeight: 32 }}>{part({ day: 'numeric' })}</AppText>
          <AppText variant="caption" weight="bold" style={{ color: SOFT, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {part({ month: 'short' })} · {part({ weekday: 'short' })} {part({ hour: 'numeric', minute: '2-digit' })}
          </AppText>
        </View>
        <AppText weight="bold" numberOfLines={2} style={{ color: INK, minHeight: 40 }}>
          {event.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={{ color: SOFT }}>
          {event.place ?? event.group_name ?? `Hosted by ${event.host_name}`}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="people" size={14} color={SOFT} />
          <AppText variant="caption" weight="bold" style={{ color: INK }}>
            {who}
          </AppText>
        </View>
      </Pressable>
      {event.i_am_going ? (
        <View style={{ alignItems: 'center', paddingVertical: 8, borderRadius: t.radius.md, backgroundColor: 'rgba(255,255,255,0.14)' }}>
          <AppText variant="small" weight="bold" style={{ color: INK }}>
            You&apos;re in
          </AppText>
        </View>
      ) : event.ticket_price_cents != null ? (
        <Button label={`Tickets ${money(event.ticket_price_cents)}`} size="md" onPress={open} accessibilityLabel={`Buy tickets for ${event.title}, ${money(event.ticket_price_cents)}`} />
      ) : full ? (
        <Button label="Join waitlist" size="md" variant="secondary" onPress={open} />
      ) : (
        <Button label="I'm In" size="md" onPress={onIn} accessibilityLabel={`I'm In for ${event.title}`} />
      )}
    </View>
  );
}
