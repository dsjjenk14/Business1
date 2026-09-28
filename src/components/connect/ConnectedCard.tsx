import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppText, Avatar, Button, Card } from '@/components/ui';
import type { ConnectResult } from '@/features/connect/api';
import { useTheme } from '@/theme';

/** "You're connected with Maya": what just happened and what to do next. */
export function ConnectedCard({ result }: { result: ConnectResult }) {
  const t = useTheme();
  const router = useRouter();
  const first = result.user.display_name.split(' ')[0];
  return (
    <Card accent="trust">
      <View style={{ alignItems: 'center', gap: t.space[2] }}>
        <Avatar name={result.user.display_name} uri={result.user.avatar_url} size={64} ring="trust" />
        <AppText variant="h3" align="center" accessibilityRole="header">
          {result.status === 'already' ? `You and ${first} were already connected` : `You're connected with ${first}`}
        </AppText>
        <AppText variant="small" tone="muted" align="center">
          {result.kind === 'qr'
            ? `You met in person. If you'd recommend them, you can vouch for them. It's up to you.`
            : `${first} is in your circle. You can message each other.`}
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space[2], alignSelf: 'stretch' }}>
          <Button label="View profile" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/people/[id]', params: { id: result.user.id } })} />
          {result.kind === 'qr' ? (
            <Button label="Vouch" size="md" variant="trust" style={{ flex: 1 }} onPress={() => router.push('/circles/vouch')} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}
