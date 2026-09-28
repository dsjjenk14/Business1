import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, GlyphTile, type GlyphName } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { markWelcomeSeen } from '@/features/onboarding/welcome';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme, useThemeContext, type ThemeId } from '@/theme';

const SLIDES: { glyph: GlyphName; title: string; body: string }[] = [
  {
    glyph: 'spark',
    title: 'Welcome to I’m In',
    body: 'See what’s happening near you, make plans with friends, and meet people others vouch for.',
  },
  {
    glyph: 'pin',
    title: 'Pins',
    body: 'Pins are posts: a thought, a question, photos, or plans. People like and reply. Home shows your friends’ pins.',
  },
  {
    glyph: 'people',
    title: 'Your circle and vouches',
    body: 'Your circle is your friends on I’m In. Add them by scanning each other’s code, or sending a code. When you meet up in person, you can vouch for people you’d recommend. It’s always your choice.',
  },
  {
    glyph: 'moon',
    title: 'I’m In',
    body: 'When someone invites you to an event or a night out, tap I’m In to say you’re down. Make your own plans and see who’s in. You always choose who sees them.',
  },
];

/** A four-card tour for new members, then pick a dark or light look. Shown once. */
export default function Welcome() {
  const t = useTheme();
  const { setThemeId } = useThemeContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const [step, setStep] = useState(0);
  const last = step === SLIDES.length;
  const slide = SLIDES[step];

  function finish() {
    if (session) markWelcomeSeen(session.user.id);
    track('welcome_done', { step });
    if (then === 'checklist') router.replace('/checklist');
    else router.back();
  }

  function pickLook(id: ThemeId) {
    setThemeId(id);
    if (session) supabase.from('user_settings').update({ theme_id: id }).eq('user_id', session.user.id).then(() => undefined);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space[4], paddingBottom: insets.bottom + t.space[4], paddingHorizontal: t.space[5] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${SLIDES.length + 1}`} accessibilityValue={{ min: 1, max: SLIDES.length + 1, now: step + 1 }} aria-valuemin={1} aria-valuemax={SLIDES.length + 1} aria-valuenow={step + 1}>
          {[...SLIDES, null].map((_, i) => (
            <View key={i} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: i === step ? t.colors.primary : t.colors.surfaceAlt }} />
          ))}
        </View>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText tone="muted" weight="bold">
              Skip
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: t.space[4], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        {slide ? (
          <>
            <GlyphTile name={slide.glyph} size={88} />
            <AppText variant="h1" align="center" accessibilityRole="header">
              {slide.title}
            </AppText>
            <AppText align="center" tone="muted">
              {slide.body}
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="h1" align="center" accessibilityRole="header">
              Pick your look
            </AppText>
            <AppText align="center" tone="muted">
              You can change it any time in Settings → Appearance.
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[3], alignSelf: 'stretch' }}>
              {(
                [
                  { id: 'N', label: 'Dark', bg: '#0C0C0C', fg: '#F5F5F5', accent: '#D62828' },
                  { id: 'L', label: 'Light', bg: '#FAFAF7', fg: '#111512', accent: '#0F7A4A' },
                ] as const
              ).map((o) => {
                const selected = t.id === o.id;
                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    aria-checked={selected}
                    accessibilityLabel={`${o.label} look`}
                    onPress={() => pickLook(o.id as ThemeId)}
                    style={{
                      flex: 1,
                      aspectRatio: 0.8,
                      borderRadius: t.radius.lg,
                      backgroundColor: o.bg,
                      borderWidth: 3,
                      borderColor: selected ? t.colors.primary : t.colors.border,
                      padding: t.space[3],
                      justifyContent: 'flex-end',
                      gap: 6,
                    }}>
                    <View style={{ height: 10, width: '70%', borderRadius: 5, backgroundColor: o.fg, opacity: 0.8 }} />
                    <View style={{ height: 10, width: '45%', borderRadius: 5, backgroundColor: o.fg, opacity: 0.4 }} />
                    <View style={{ height: 24, borderRadius: 8, backgroundColor: o.accent, marginTop: 6 }} />
                    <AppText weight="bold" align="center" style={{ color: o.fg, marginTop: 6 }}>
                      {o.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      <View style={{ gap: t.space[2], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        {last ? (
          <Button label="Let’s go" onPress={finish} />
        ) : (
          <Button label="Next" onPress={() => setStep((s) => s + 1)} />
        )}
        {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} /> : null}
      </View>
    </View>
  );
}
