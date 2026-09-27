import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

const ToastContext = createContext<(message: string) => void>(() => {});

/** Short confirmation messages ("Saved to bookmarks"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ pointerEvents: 'none', position: 'absolute', left: t.space[4], right: t.space[4], bottom: insets.bottom + 84, alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: t.colors.surfaceAlt,
              borderColor: t.colors.borderStrong,
              borderWidth: t.borderWidth.hairline,
              borderRadius: t.radius.pill,
              paddingHorizontal: t.space[4],
              paddingVertical: t.space[2] + 2,
              boxShadow: t.shadow.raised,
            }}>
            <AppText variant="small" weight="bold">
              {message}
            </AppText>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
