import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AppText, Button, useToast } from '@/components/ui';
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
};

// The story always uses the brand look, whatever theme the sharer picked.
const BRAND = { bg: '#0E0B14', text: '#F4F1F6', muted: '#A8A1B0', red: '#E5312F', card: '#1A1720' };
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
          <View ref={ref} collapsable={false} style={{ width: W, height: H, backgroundColor: BRAND.bg, padding: 20, justifyContent: 'space-between' }}>
            <AppText style={{ color: BRAND.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
              I&apos;m <AppText style={{ color: BRAND.red, fontSize: 28, fontWeight: '800' }}>In</AppText>
            </AppText>
            <View style={{ gap: 10 }}>
              {story.imageUrl ? (
                <Image
                  source={{ uri: story.imageUrl }}
                  onLoad={() => setImageReady(true)}
                  onError={() => setImageReady(true)}
                  style={{ width: W - 40, height: story.kind === 'profile' ? W - 40 : (W - 40) * 0.75, borderRadius: story.kind === 'profile' ? (W - 40) / 2 : 14, backgroundColor: BRAND.card }}
                  contentFit="cover"
                />
              ) : null}
              <AppText style={{ color: BRAND.text, fontSize: 24, fontWeight: '800', lineHeight: 28 }} numberOfLines={3}>
                {story.title}
              </AppText>
              {story.line1 ? <AppText style={{ color: BRAND.red, fontSize: 14, fontWeight: '700' }}>{story.line1}</AppText> : null}
              {story.line2 ? <AppText style={{ color: BRAND.muted, fontSize: 13 }}>{story.line2}</AppText> : null}
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
