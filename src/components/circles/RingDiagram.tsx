import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { PersonLite } from '@/features/circles/api';
import { STATUS_COLORS, STATUS_LABELS } from '@/features/people/status';
import { useTheme } from '@/theme';

/**
 * You in the center, your 1st degree on the inner ring, your 2nd degree
 * (dimmed) on the outer ring. Tapping anyone opens their profile.
 */
export function RingDiagram({ me, first, second }: { me: PersonLite; first: PersonLite[]; second: PersonLite[] }) {
  const t = useTheme();
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const size = Math.min(width, 340);
  const c = size / 2;
  const r1 = size * 0.25;
  const r2 = size * 0.43;
  const inner = first.slice(0, 8);
  const outer = second.slice(0, 12);

  const place = (i: number, n: number, r: number, offset: number) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2 + offset;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const open = (id: string) => router.push({ pathname: '/people/[id]', params: { id } });

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={false}
      style={{ width: '100%', alignItems: 'center' }}>
      {size > 0 ? (
        <View
          style={{ width: size, height: size }}
          accessibilityLabel={`Your Insiders: ${first.length} Insiders, ${second.length} in your network`}>
          <View style={{ position: 'absolute', left: c - r2, top: c - r2, width: r2 * 2, height: r2 * 2, borderRadius: r2, borderWidth: 1, borderColor: t.colors.border, borderStyle: 'dashed' }} />
          <View style={{ position: 'absolute', left: c - r1, top: c - r1, width: r1 * 2, height: r1 * 2, borderRadius: r1, borderWidth: 1.5, borderColor: t.colors.primary, opacity: 0.6 }} />
          <AppText variant="caption" tone="subtle" style={{ position: 'absolute', top: 0, width: size, textAlign: 'center' }}>
            2ND DEGREE
          </AppText>
          {outer.map((p, i) => {
            const { x, y } = place(i, outer.length, r2, Math.PI / 12);
            return (
              <Pressable key={p.id} accessibilityLabel={`${p.display_name}, 2nd degree`} onPress={() => open(p.id)}
                style={{ position: 'absolute', left: x - 16, top: y - 16, opacity: 0.7 }}>
                <Avatar name={p.display_name} uri={p.avatar_url} size={32} userId={p.id} />
              </Pressable>
            );
          })}
          {inner.map((p, i) => {
            const { x, y } = place(i, inner.length, r1, 0);
            return (
              <Pressable key={p.id} accessibilityLabel={`${p.display_name}, one of your Insiders`} onPress={() => open(p.id)}
                style={{ position: 'absolute', left: x - 22, top: y - 30, alignItems: 'center', width: 44 }}>
                <Avatar name={p.display_name} uri={p.avatar_url} size={44} userId={p.id} />
                <AppText variant="caption" numberOfLines={1} style={{ fontSize: 10, lineHeight: 12 }}>
                  {p.display_name.split(' ')[0]}
                </AppText>
              </Pressable>
            );
          })}
          <View style={{ position: 'absolute', left: c - 30, top: c - 38, alignItems: 'center', width: 60 }}>
            <Avatar name={me.display_name} uri={me.avatar_url} size={60} userId={me.id} />
            <AppText variant="caption" weight="bold" style={{ fontSize: 10, lineHeight: 12 }}>
              YOU
            </AppText>
          </View>
        </View>
      ) : null}
      {/* What the colored rings mean. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space[4], paddingTop: t.space[2] }}>
        {(['live', 'out', 'virtual'] as const).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: STATUS_COLORS[k] }} />
            <AppText variant="caption" tone="muted">
              {STATUS_LABELS[k]}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
