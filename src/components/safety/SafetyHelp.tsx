import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { callNumber } from '@/lib/sms';
import { useTheme } from '@/theme';

/**
 * Where to get help after something happened in person. Shown on the Report screen when
 * someone picks assault or violence, and again after they send it.
 * Numbers: 911; RAINN National Sexual Assault Hotline 800-656-4673 (rainn.org);
 * National Domestic Violence Hotline 800-799-7233 (thehotline.org).
 */
export function SafetyHelp({ kind }: { kind: 'assault' | 'violence' }) {
  const t = useTheme();
  return (
    <Card accent="primary" style={{ gap: t.space[3] }}>
      <AppText weight="bold">You’re not alone, and it’s not your fault.</AppText>
      <View style={{ gap: t.space[2] }}>
        <Button label="In danger now? Call 911" variant="danger" onPress={() => callNumber('911')} />
        {kind === 'assault' ? (
          <>
            <Button label="RAINN hotline: 800-656-4673" variant="secondary" onPress={() => callNumber('8006564673')} />
            <Button label="Chat with RAINN online" variant="ghost" onPress={() => Linking.openURL('https://www.rainn.org')} />
          </>
        ) : (
          <Button label="Domestic Violence Hotline: 800-799-7233" variant="secondary" onPress={() => callNumber('8007997233')} />
        )}
      </View>
      <AppText variant="small" tone="muted">
        Free, confidential, and open 24/7.{' '}
        {kind === 'assault'
          ? 'You can get a medical exam without making a police report, and RAINN can connect you to a local hospital and an advocate. '
          : ''}
        To make a police report, call 911, or 311 in DC if it isn’t an emergency. We save your messages and date details from the moment you
        report, so police can ask us for them, even if the other person deletes their account.
      </AppText>
    </Card>
  );
}
