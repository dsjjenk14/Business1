import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppText, Card, GlyphTile, SponsoredLabel } from '@/components/ui';
import type { FeedPlacement } from '@/features/places/api';
import { useTheme } from '@/theme';

/** A Featured / Sponsored place in a feed. Always labeled; never disguised as a post. */
export function PlacementCard({ place }: { place: FeedPlacement }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card
      accent="sponsored"
      onPress={() => router.push({ pathname: '/venues/[id]', params: { id: String(place.venue_id) } })}
      accessibilityLabel={`${place.kind === 'sponsored' ? 'Sponsored' : 'Featured'}: ${place.name}. ${place.perk}`}>
      <View style={{ gap: t.space[2] }}>
        <SponsoredLabel kind={place.kind === 'sponsored' ? 'Sponsored' : 'Featured'} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          <GlyphTile name={place.glyph ?? 'pin'} size={44} tone="sponsored" />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">{place.name}</AppText>
            <AppText variant="small" tone="sponsored" weight="bold">
              {place.perk}
            </AppText>
            <AppText variant="caption" tone="subtle">
              {[
                place.neighborhood,
                place.distance_mi != null ? `${place.distance_mi} mi` : null,
                place.network_visited ? `${place.network_visited} from your network have been` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>
        </View>
      </View>
    </Card>
  );
}
