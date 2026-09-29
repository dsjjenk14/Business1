import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, EmptyState, Screen, TextField } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { LIVE_AUDIENCES, startLive, useLiveEnabled, type LiveAudience } from '@/features/live/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Go live: a title and who can watch. Your Insiders get a notification. */
export default function GoLive() {
  const t = useTheme();
  const router = useRouter();
  const enabled = useLiveEnabled();
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<LiveAudience>('circle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!title.trim()) {
      setError('Give your live video a title.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await startLive(title, audience);
      track('live_started', { audience });
      router.replace({ pathname: '/live/[id]', params: { id: String(id) } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Go live" />
      <Screen contentGap={t.space[5]}>
        {!enabled ? (
          <EmptyState glyph="camera" title="Live video is coming soon" body="It turns on once the video service is set up." />
        ) : (
          <>
            <TextField label="What's happening?" value={title} onChangeText={setTitle} placeholder="Rooftop sunset with the crew" maxLength={80} />
            <View style={{ gap: t.space[2] }}>
              <AppText variant="label" tone="subtle">
                Who can watch
              </AppText>
              <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
                {LIVE_AUDIENCES.map((o) => {
                  const selected = audience === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      aria-checked={selected}
                      onPress={() => setAudience(o.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.space[3],
                        padding: t.space[3],
                        borderRadius: t.radius.md,
                        borderWidth: t.borderWidth.regular,
                        borderColor: selected ? t.colors.primary : t.colors.border,
                        backgroundColor: t.colors.surface,
                      }}>
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? t.colors.primary : t.colors.textSubtle} />
                      <View style={{ flex: 1 }}>
                        <AppText weight="bold">{o.label}</AppText>
                        <AppText variant="small" tone="muted">
                          {o.detail}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <AppText variant="caption" tone="subtle">
              Live videos end on their own after 2 hours and aren&apos;t saved. Keep it safe: don&apos;t show where you live, and follow the Community
              Guidelines.
            </AppText>
            {error ? (
              <AppText tone="danger" accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}
            <Button label="Go live" onPress={go} loading={busy} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
