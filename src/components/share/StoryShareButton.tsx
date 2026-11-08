import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AppText, Button, StickerCircle, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { WEB_URL } from '@/lib/webUrl';

/** What goes on the story image. */
export type Story = {
  kind: 'event' | 'profile';
  title: string;
  /** e.g. "Fri, Oct 9 · 7:00 PM" or "28 · Tysons" */
  line1?: string | null;
  /** e.g. the place, or "Connector · 42 vouches" */
  line2?: string | null;
  imageUrl?: string | null;
  /** Path on the web app, e.g. /events/12, for the link. */
  path: string;
  /** Profile stories: their mood, stickers and profile color. */
  mood?: string | null;
  stickers?: { label: string; fill: string; ink: string }[];
  accent?: string | null;
};

// The story always uses the brand look, whatever theme the sharer picked.
const BRAND = { bg: '#0C0C0C', text: '#F5F5F5', muted: 'rgba(245,245,245,0.62)', red: '#D62828', gold: '#D4AF37', card: '#161616' };
const W = 270; // drawn at 270 x 480, saved at 1080 x 1920 (Instagram Story size)
const H = 480;

/**
 * Makes a 9:16 image for Instagram Stories (or anywhere) and opens the share
 * sheet, where Instagram shows up. On the web it copies the link instead.
 */
export function StoryShareButton({ story, label = 'Share to Instagram Stories' }: { story: Story; label?: string }) {
  const toast = useToast();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [drawing, setDrawing] = useState(false);
  const [imageReady, setImageReady] = useState(!story.imageUrl);
  const url = `${WEB_URL}${story.path}`;

  useEffect(() => {
    if (!drawing || !imageReady) return;
    let cancelled = false;
    // One frame for layout, then save it.
    const timer = setTimeout(async () => {
      try {
        const uri = await captureRef(ref, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
        if (cancelled) return;
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share to your story' });
        track('story_shared', { kind: story.kind });
      } catch {
        toast('Couldn’t make the story image. Try again.');
      } finally {
        if (!cancelled) setDrawing(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drawing, imageReady, story.kind, toast]);

  async function onPress() {
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync().catch(() => false))) {
      await Clipboard.setStringAsync(`${story.title} on I'm In: ${url}`);
      toast('Link copied. Paste it in your story.');
      return;
    }
    setDrawing(true);
    // If the photo never loads, share without waiting for it.
    if (story.imageUrl) setTimeout(() => setImageReady(true), 2500);
  }

  return (
    <>
      <Button label={label} variant="secondary" size="md" onPress={onPress} loading={drawing} />
      {drawing ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
          <View ref={ref} collapsable={false} style={{ width: W, height: H, backgroundColor: BRAND.bg, padding: 20, justifyContent: 'space-between', overflow: 'hidden' }}>
            {story.kind === 'profile' ? (
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 170, backgroundColor: story.accent ?? BRAND.red, opacity: 0.35 }} />
            ) : null}
            <AppText style={{ color: BRAND.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
              I&apos;m <AppText style={{ color: BRAND.red, fontSize: 28, fontWeight: '800' }}>In</AppText>
            </AppText>
            <View style={{ gap: 10 }}>
              {story.imageUrl ? (
                <Image
                  source={{ uri: story.imageUrl }}
                  onLoad={() => setImageReady(true)}
                  onError={() => setImageReady(true)}
                  style={{
                    width: story.kind === 'profile' ? 130 : W - 40,
                    height: story.kind === 'profile' ? 130 : (W - 40) * 0.75,
                    borderRadius: story.kind === 'profile' ? 44 : 14,
                    borderWidth: story.kind === 'profile' ? 4 : 0,
                    borderColor: BRAND.bg,
                    backgroundColor: BRAND.card,
                  }}
                  contentFit="cover"
                />
              ) : null}
              <AppText style={{ color: BRAND.text, fontSize: 24, fontWeight: '800', lineHeight: 28 }} numberOfLines={3}>
                {story.title}
              </AppText>
              {story.line1 ? <AppText style={{ color: BRAND.red, fontSize: 14, fontWeight: '700' }}>{story.line1}</AppText> : null}
              {story.line2 ? <AppText style={{ color: BRAND.muted, fontSize: 13 }}>{story.line2}</AppText> : null}
              {story.mood ? (
                <AppText style={{ color: BRAND.text, fontSize: 14 }}>
                  <AppText style={{ color: BRAND.gold, fontSize: 14, fontWeight: '800' }}>Mood:</AppText> {story.mood}
                </AppText>
              ) : null}
              {story.stickers?.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {story.stickers.slice(0, 3).map((st) => (
                    <StickerCircle key={st.label} label={st.label} fill={st.fill} ink={st.ink} edge={BRAND.text} />
                  ))}
                </View>
              ) : null}
            </View>
            <View style={{ gap: 4 }}>
              <AppText style={{ color: BRAND.text, fontSize: 13, fontWeight: '700' }}>
                {story.kind === 'event' ? 'Say I’m In on the app' : 'Find me on I’m In'}
              </AppText>
              <AppText style={{ color: BRAND.muted, fontSize: 11 }}>{url.replace(/^https?:\/\//, '')}</AppText>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}
