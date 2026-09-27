import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/ui';
import { AppConfigProvider } from '@/config/useAppConfig';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { FONT_MAP, THEMES, ThemeProvider, useTheme, useThemeContext, type ThemeId } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** After login, apply the theme saved on the account (so it follows you across devices). */
function useAccountTheme(userId: string | undefined) {
  const { setThemeId } = useThemeContext();
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_settings')
      .select('theme_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme_id && data.theme_id in THEMES) setThemeId(data.theme_id as ThemeId);
      });
  }, [userId, setThemeId]);
}

function RootNavigator() {
  const t = useTheme();
  const { session } = useAuth();
  useAccountTheme(session?.user.id);
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const ready = (fontsLoaded || !!fontError) && session !== undefined;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;
  const signedIn = !!session;

  return (
    <ToastProvider>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </ToastProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}
