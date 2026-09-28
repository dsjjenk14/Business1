import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacementCard } from '@/components/places/PlacementCard';
import { PinCard } from '@/components/pins/PinCard';
import { RadiusControl } from '@/components/pins/RadiusControl';
import { AppText, Card, Chip, EmptyState, Glyph, GlyphTitle, IconButton, LoadingList, Segmented } from '@/components/ui';
import { useApproxLocation } from '@/features/location/useApproxLocation';
import { FILTERS, fetchFeed, type FeedPin, type PinCategory } from '@/features/pins/api';
import { fetchFeedPlacement, type FeedPlacement } from '@/features/places/api';
import { DEFAULT_RADIUS_MI, SEARCH_RADIUS_MI } from '@/lib/radius';
import { useTheme } from '@/theme';

type Tab = 'nearby' | 'community';

/** Pins: the heart of the app. Nearby (radius) and They're In (whole community). */
export default function Pins() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { location } = useApproxLocation();

  const [tab, setTab] = useState<Tab>('nearby');
  const [category, setCategory] = useState<PinCategory | 'all'>('all');
  const [pins, setPins] = useState<FeedPin[] | null>(null);
  const [trending, setTrending] = useState<FeedPin | null>(null);
  const [placement, setPlacement] = useState<FeedPlacement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [radius, setRadius] = useState(DEFAULT_RADIUS_MI);
  const [effectiveRadius, setEffectiveRadius] = useState(DEFAULT_RADIUS_MI);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const common = { lat: location?.lat, lng: location?.lng, radiusMi: effectiveRadius, category: category === 'all' ? null : category };
    try {
      const [feed, top, place] = await Promise.all([
        fetchFeed({ ...common, mode: tab }),
        tab === 'nearby' ? fetchFeed({ ...common, category: null, mode: 'trending', limit: 1 }) : Promise.resolve([]),
        tab === 'nearby' ? fetchFeedPlacement(common.lat, common.lng).catch(() => null) : Promise.resolve(null),
      ]);
      if (id !== requestId.current) return;
      setPins(feed);
      setTrending(top[0] ?? null);
      setPlacement(place);
      setDone(feed.length < 30);
      setError(null);
    } catch {
      if (id === requestId.current) setError("Couldn't load pins. Pull down to try again.");
    }
  }, [tab, category, effectiveRadius, location?.lat, location?.lng]);

  // Loads on first view, whenever filters change, and when coming back from a thread or New Pin.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    if (loadingMore || done || !pins?.length) return;
    setLoadingMore(true);
    try {
      const more = await fetchFeed({
        mode: tab,
        lat: location?.lat,
        lng: location?.lng,
        radiusMi: effectiveRadius,
        category: category === 'all' ? null : category,
        before: pins[pins.length - 1]!.created_at,
      });
      setPins((p) => [...(p ?? []), ...more.filter((m) => !p?.some((x) => x.id === m.id))]);
      if (more.length < 30) setDone(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const updatePin = (next: FeedPin) => {
    setPins((list) => list?.map((p) => (p.id === next.id ? next : p)) ?? null);
    setTrending((tp) => (tp?.id === next.id ? next : tp));
  };

  const header = (
    <View style={{ gap: t.space[4], paddingBottom: t.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
          Pins
        </AppText>
        <IconButton icon="flame-outline" label="What's In: trending" onPress={() => router.push('/whats-in')} />
        <IconButton icon="bookmark-outline" label="Bookmarks" onPress={() => router.push('/pins/bookmarks')} />
        <IconButton icon="create-outline" label="New pin" onPress={() => router.push('/pins/new')} />
      </View>

      <Segmented<Tab>
        options={[
          { key: 'nearby', label: 'Nearby' },
          { key: 'community', label: "They're In" },
        ]}
        value={tab}
        onChange={(k) => {
          setTab(k);
          setPins(null);
        }}
      />

      {tab === 'nearby' ? (
        <RadiusControl
          label="Nearby radius"
          value={radius}
          onChange={setRadius}
          onCommit={setEffectiveRadius}
          max={SEARCH_RADIUS_MI}
          planMax={SEARCH_RADIUS_MI}
          premiumMax={null}
        />
      ) : (
        <Card>
          <GlyphTitle glyph="globe" tone="ai">They&apos;re In: the whole community</GlyphTitle>
          <AppText variant="small" tone="muted">
            Pins from everyone on I&apos;m In, not limited by distance. See what&apos;s happening across the network.
          </AppText>
        </Card>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} glyph={f.glyph} selected={category === f.key} onPress={() => setCategory(f.key)} />
        ))}
      </ScrollView>

      {tab === 'nearby' && trending && trending.reply_count > 0 ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Trending within ${effectiveRadius} miles: ${trending.body}. ${trending.reply_count} replies. Join`}
          onPress={() => router.push({ pathname: '/pins/[id]', params: { id: String(trending.id) } })}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[3],
            padding: t.space[3],
            borderRadius: t.radius.lg,
            ...(t.style.surface === 'flat' ? { borderLeftWidth: 3 } : { borderWidth: t.borderWidth.regular }),
            borderColor: t.colors.primary,
            backgroundColor: t.colors.surface,
          }}>
          <Glyph name="flame" size={26} tone="primary" />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" weight="bold" tone="primary">
              TRENDING WITHIN {effectiveRadius} MI
            </AppText>
            <AppText variant="small" numberOfLines={1}>
              &ldquo;{trending.body}&rdquo; · {trending.reply_count} replies
            </AppText>
          </View>
          <AppText variant="small" weight="bold" tone="primary">
            Join →
          </AppText>
        </Pressable>
      ) : null}

      {error ? <AppText tone="danger">{error}</AppText> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={pins ?? []}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => (
          <>
            <PinCard pin={item} locationMode={tab === 'nearby' ? 'distance' : 'city'} onChange={updatePin} />
            {index === 2 && placement ? (
              <View style={{ marginTop: t.space[3] }}>
                <PlacementCard place={placement} />
              </View>
            ) : null}
          </>
        )}
        ItemSeparatorComponent={() => <View style={{ height: t.space[3] }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          pins === null ? (
            <LoadingList rows={4} />
          ) : (
            <EmptyState
              glyph="pin"
              title="Nothing here yet"
              body={tab === 'nearby' ? `No pins within ${effectiveRadius} miles yet. Widen the radius, or be the first to drop one.` : 'No pins in this category yet.'}
              action={{ label: 'Drop a pin', onPress: () => router.push('/pins/new') }}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingTop: t.space[4] }}>
              <LoadingList rows={1} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
        contentContainerStyle={{ padding: t.space[4], paddingBottom: insets.bottom + 96, width: '100%', maxWidth: 640, alignSelf: 'center' }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New pin"
        onPress={() => router.push('/pins/new')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: t.space[4],
          bottom: t.space[4],
          backgroundColor: t.colors.primary,
          borderRadius: t.style.controls === 'ticket' ? t.radius.sm : t.radius.pill,
          paddingHorizontal: t.space[5],
          minHeight: 48,
          justifyContent: 'center',
          boxShadow: t.shadow.raised,
          opacity: pressed ? 0.85 : 1,
        })}>
        <AppText
          weight="bold"
          style={[
            { color: t.colors.onPrimary },
            t.style.controls === 'ticket' ? { fontFamily: t.fonts.display, fontSize: 21, lineHeight: 24, letterSpacing: 1, paddingTop: 2 } : null,
          ]}>
          + New Pin
        </AppText>
      </Pressable>
    </View>
  );
}
