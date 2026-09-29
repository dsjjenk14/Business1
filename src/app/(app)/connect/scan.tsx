import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { ConnectedCard } from '@/components/connect/ConnectedCard';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, EmptyState, Screen, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { codeFromScan, redeemConnectCode, type ConnectResult } from '@/features/connect/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** Scan the other person's I'm In code to connect (in person). */
export default function ScanToConnect() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ConnectResult | null>(null);
  const handling = useRef(false);

  async function onScan(data: string) {
    if (handling.current || result) return;
    const code = codeFromScan(data);
    if (!code) return;
    handling.current = true;
    try {
      setResult(await redeemConnectCode(code));
      track('connected', { how: 'qr' });
    } catch (e) {
      toast(friendlyError(e));
      // Let them try again after a moment.
      setTimeout(() => (handling.current = false), 2500);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Scan their code" />
      {result ? (
        <Screen>
          <ConnectedCard result={result} />
        </Screen>
      ) : Platform.OS === 'web' ? (
        <Screen>
          <EmptyState glyph="camera" title="Scan with your phone" body="Scanning works in the I'm In app on your phone. On the web, use a shared code instead." />
        </Screen>
      ) : !permission ? null : !permission.granted ? (
        <Screen>
          <EmptyState
            glyph="camera"
            title="Camera needed to scan"
            body="I'm In only uses the camera here, to read their code."
            action={
              permission.canAskAgain
                ? { label: 'Allow camera', onPress: requestPermission }
                : { label: 'Use a shared code instead', onPress: () => router.replace('/connect') }
            }
          />
        </Screen>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onScan(data)}
          />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: t.space[5], gap: t.space[2], backgroundColor: t.colors.overlay }}>
            <AppText weight="bold" align="center" style={{ color: '#FFFFFF' }}>
              Point at their I&apos;m In code
            </AppText>
            <AppText variant="small" align="center" style={{ color: '#FFFFFF' }}>
              They can show it from Insiders → Add someone → Show my code.
            </AppText>
          </View>
        </View>
      )}
    </View>
  );
}
