import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Glyph, Screen } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { DEFAULT_RADIUS_MI } from '@/lib/radius';
import { fetchGoingOut, type GoingOutFeed } from '@/features/tonight/api';
import { useTheme } from '@/theme';

type Dot = { key: string; lat: number; lng: number; kind: 'me' | 'person' | 'event'; label: string; emoji: string | null; avatarUrl: string | null; degree: number; onPress: () => void };

const MILES_PER_DEG_LAT = 69;

/**
 * "Nearby Tonight" map: who's out and where events are, relative to you.
 * Points are the same ~quarter-mile approximations the server shares; no
 * exact locations and no map tiles (so no third-party map service).
 */
export default function TonightMap() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ when?: 'tonight' | 'weekend' }>();
  const when = params.when === 'weekend' ? 'weekend' : 'tonight';
  const { location, status } = useApproxLocation();
  const lat = location?.lat;
  const lng = location?.lng;
  const [feed, setFeed] = useState<GoingOutFeed | null>(null);
  const radius = DEFAULT_RADIUS_MI;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchGoingOut(when, { lat, lng, radiusMi: radius })
        .then((f) => !cancelled && setFeed(f))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [when, lat, lng, radius]),
  );

  const dots: Dot[] = [
    ...(feed?.people ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        key: `p${p.post_id}`,
        lat: p.lat as number,
        lng: p.lng as number,
        kind: (p.is_me ? 'me' : 'person') as Dot['kind'],
        label: p.is_me ? 'You' : (p.display_name.split(' ')[0] ?? p.display_name),
        emoji: p.avatar_emoji,
        avatarUrl: p.avatar_url,
        degree: p.degree,
        onPress: () => router.push({ pathname: '/people/[id]', params: { id: p.user_id } }),
      })),
    ...(feed?.events ?? [])
      .filter((e) => e.lat != null && e.lng != null)
      .map((e) => ({
        key: `e${e.id}`,
        lat: e.lat as number,
        lng: e.lng as number,
        kind: 'event' as const,
        label: e.title,
        emoji: e.emoji ?? 'calendar',
        avatarUrl: null,
        degree: 0,
        onPress: () => router.push({ pathname: '/events/[id]', params: { id: String(e.id) } }),
      })),
  ];

  // Center on you (or on everyone, if location is off).
  const center = location ?? (dots.length ? { lat: dots.reduce((s, d) => s + d.lat, 0) / dots.length, lng: dots.reduce((s, d) => s + d.lng, 0) / dots.length } : null);
  const size = Math.min(width - t.space[4] * 2, 480);
  const half = size / 2;
  const toMiles = (lat: number, lng: number) =>
    center
      ? { dx: (lng - center.lng) * MILES_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180), dy: (lat - center.lat) * MILES_PER_DEG_LAT }
      : { dx: 0, dy: 0 };
  // Zoom to fit everyone (people in your network can be further than your radius).
  const farthest = Math.max(1, ...dots.map((d) => Math.hypot(toMiles(d.lat, d.lng).dx, toMiles(d.lat, d.lng).dy)));
  const milesAcross = niceMiles(farthest * 1.1);
  const usable = half - 28;
  // Place each dot, then nudge any that would sit on top of one already placed.
  const placed: { x: number; y: number }[] = [];
  const positions = dots.map((d) => {
    const { dx, dy } = toMiles(d.lat, d.lng);
    let x = half + (dx / milesAcross) * usable;
    let y = half - (dy / milesAcross) * usable;
    for (let i = 0; i < 24 && placed.some((p) => Math.hypot(p.x - x, p.y - y) < 46); i++) {
      const angle = i * 2.4;
      const r = 46 + i * 4;
      x = half + (dx / milesAcross) * usable + Math.cos(angle) * r;
      y = half - (dy / milesAcross) * usable + Math.sin(angle) * r;
    }
    x = Math.max(24, Math.min(size - 24, x));
    y = Math.max(24, Math.min(size - 40, y));
    placed.push({ x, y });
    return { x, y };
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={when === 'weekend' ? 'Nearby This Weekend' : 'Nearby Tonight'} />
      <Screen contentGap={t.space[4]}>
        <View
          accessibilityLabel={`Map within ${radius} miles. ${dots.length} people and events.`}
          style={{ width: size, height: size, alignSelf: 'center', borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.colors.surface, borderWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
          <Svg width={size} height={size}>
            {[0.5, 1].map((f) => (
              <Circle key={f} cx={half} cy={half} r={usable * f} stroke={t.colors.border} strokeWidth={1} fill="none" strokeDasharray="4 6" />
            ))}
            <Line x1={half} y1={0} x2={half} y2={size} stroke={t.colors.border} strokeWidth={1} />
            <Line x1={0} y1={half} x2={size} y2={half} stroke={t.colors.border} strokeWidth={1} />
          </Svg>
          {[0.5, 1].map((f) => (
            <AppText key={f} variant="caption" tone="subtle" style={{ position: 'absolute', left: half + 4, top: half - usable * f + 2 }}>
              {formatMiles(milesAcross * f)}
            </AppText>
          ))}
          {location ? (
            <View style={{ position: 'absolute', left: half - 7, top: half - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: t.colors.ai, borderWidth: 2, borderColor: t.colors.bg }} />
          ) : null}
          {dots.map((d, i) => {
            const { x, y } = positions[i] ?? { x: half, y: half };
            return (
              <Pressable
                key={d.key}
                accessibilityRole="link"
                accessibilityLabel={d.kind === 'event' ? `Event: ${d.label}` : d.label}
                onPress={d.onPress}
                style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, alignItems: 'center' }}>
                {d.kind === 'event' ? (
                  <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceAlt, borderWidth: 2, borderColor: t.colors.primary }}>
                    <Glyph name={d.emoji} size={20} tone="primary" />
                  </View>
                ) : (
                  <Avatar name={d.label} uri={d.avatarUrl} size={36} ring={d.kind === 'me' ? 'primary' : d.degree === 1 ? 'trust' : 'ai'} />
                )}
                <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 72 }}>
                  {d.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[4], justifyContent: 'center' }}>
          <Legend color={t.colors.trust} label="Your circle" />
          <Legend color={t.colors.ai} label="Network / nearby" />
          <Legend color={t.colors.primary} label="Event" square />
        </View>
        <AppText variant="caption" tone="subtle" align="center">
          Nearby within {radius} mi, plus your circle and network wherever they are{status === 'denied' ? ' (centered on your profile location; location is off)' : ''}.
          Spots are approximate (about a quarter mile), never exact.
        </AppText>
        {feed && dots.length === 0 ? (
          <AppText tone="muted" align="center">
            Nobody&apos;s on the map yet {when === 'weekend' ? 'this weekend' : 'tonight'}.
          </AppText>
        ) : null}
      </Screen>
    </View>
  );
}

/** Round a distance up to a friendly map scale: 1, 2, 5, 10, 20, 50… miles. */
function niceMiles(mi: number) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  return steps.find((s) => s >= mi) ?? Math.ceil(mi / 100) * 100;
}

const formatMiles = (mi: number) => `${Number.isInteger(mi) ? mi : mi.toFixed(1)} mi`;

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
      <View style={{ width: 12, height: 12, borderRadius: square ? 3 : 6, borderWidth: 2, borderColor: color }} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}
