import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Card, GlyphTitle, Section } from '@/components/ui';
import { fetchEventPhotos } from '@/features/pins/api';
import { useTheme } from '@/theme';

type Photo = { pin_id: number; url: string; author_name: string };

/**
 * After an event: "Post a photo from Gallery Night?" for people who went, and
 * a recap gallery of everyone's photos.
 */
export function EventPhotos({ eventId, title, went }: { eventId: number; title: string; went: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);

  const load = useCallback(() => {
    fetchEventPhotos(eventId)
      .then(setPhotos)
      .catch(() => undefined);
  }, [eventId]);
  useEffect(load, [load]);

  const post = () => router.push({ pathname: '/pins/new', params: { event: String(eventId), eventTitle: title } });

  return (
    <>
      {went ? (
        <Card accent="primary">
          <View style={{ gap: t.space[2] }}>
            <GlyphTitle glyph="camera">{`Post a photo from ${title}?`}</GlyphTitle>
            <AppText variant="small" tone="muted">
              It goes in the gallery below for everyone who went, and on your pins.
            </AppText>
            <Button label="Add photos" size="md" onPress={post} />
          </View>
        </Card>
      ) : null}
      {photos.length ? (
        <Section title={`Photos (${photos.length})`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[1] }}>
            {photos.map((p, i) => (
              <Pressable
                key={`${p.pin_id}-${i}`}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo by ${p.author_name}`}
                onPress={() => router.push({ pathname: '/pins/[id]', params: { id: String(p.pin_id) } })}
                style={{ width: '32.5%', aspectRatio: 1 }}>
                <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%', borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceAlt }} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}
