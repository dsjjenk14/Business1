import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Screen } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { usePlan } from '@/features/plan/usePlan';
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
  const { limit } = usePlan();
  const [feed, setFeed] = useState<GoingOutFeed | null>(null);
  const radius = Math.min(10, limit('search_radius_mi') ?? 10);

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
        emoji: e.emoji ?? '📅',
        avatarUrl: null,
        degree: 0,
        onPress: () => router.push({ pathname: '/events/[id]', params: { id: String(e.id) } }),
      })),
  ];

  // Center on you (or on everyone, if location is off).
  const center = location ?? (dots.length ? { lat: dots.reduce((s, d) => s + d.lat, 0) / dots.length, lng: dots.reduce((s, d) => s + d.lng, 0) / dots.length } : null);
  const size = Math.min(width - t.space[4] * 2, 480);
  const half = size / 2;
  const milesAcross = Math.max(radius, 1);
  const toXY = (lat: number, lng: number) => {
    if (!center) return { x: half, y: half };
    const dy = (lat - center.lat) * MILES_PER_DEG_LAT;
    const dx = (lng - center.lng) * MILES_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
    const clamp = (v: number) => Math.max(18, Math.min(size - 18, v));
    return { x: clamp(half + (dx / milesAcross) * (half - 20)), y: clamp(half - (dy / milesAcross) * (half - 20)) };
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={when === 'weekend' ? 'Nearby This Weekend' : 'Nearby Tonight'} />
      <Screen contentGap={t.space[4]}>
        <View
          accessibilityLabel={`Map within ${radius} miles. ${dots.length} people and events.`}
          style={{ width: size, height: size, alignSelf: 'center', borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.colors.surface, borderWidth: t.borderWidth.hairline, borderColor: t.colors.border }}>
          <Svg width={size} height={size}>
            {[0.33, 0.66, 1].map((f) => (
              <Circle key={f} cx={half} cy={half} r={(half - 20) * f} stroke={t.colors.border} strokeWidth={1} fill="none" strokeDasharray="4 6" />
            ))}
            <Line x1={half} y1={0} x2={half} y2={size} stroke={t.colors.border} strokeWidth={1} />
            <Line x1={0} y1={half} x2={size} y2={half} stroke={t.colors.border} strokeWidth={1} />
          </Svg>
          {location ? (
            <View style={{ position: 'absolute', left: half - 7, top: half - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: t.colors.ai, borderWidth: 2, borderColor: t.colors.bg }} />
          ) : null}
          {dots.map((d) => {
            const { x, y } = toXY(d.lat, d.lng);
            return (
              <Pressable
                key={d.key}
                accessibilityRole="link"
                accessibilityLabel={d.kind === 'event' ? `Event: ${d.label}` : d.label}
                onPress={d.onPress}
                style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, alignItems: 'center' }}>
                {d.kind === 'event' ? (
                  <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceAlt, borderWidth: 2, borderColor: t.colors.primary }}>
                    <AppText>{d.emoji}</AppText>
                  </View>
                ) : (
                  <Avatar name={d.label} emoji={d.emoji} uri={d.avatarUrl} size={36} ring={d.kind === 'me' ? 'primary' : d.degree === 1 ? 'trust' : 'ai'} />
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
          Within {radius} mi{status === 'denied' ? ' of your profile location (location is off)' : ''}. Spots are approximate (about a quarter mile), never
          exact.
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
