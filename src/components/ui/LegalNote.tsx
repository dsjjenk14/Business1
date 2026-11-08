import { useRouter } from 'expo-router';

import { AppText } from './AppText';

/** A short legal notice under an action, with a link to the full document. */
export function LegalNote({ children, doc = 'terms', align = 'center' }: { children: React.ReactNode; doc?: 'terms' | 'privacy' | 'guidelines'; align?: 'center' | 'left' }) {
  const router = useRouter();
  const label = doc === 'privacy' ? 'Privacy Policy' : doc === 'guidelines' ? 'Community Guidelines' : 'Terms';
  return (
    <AppText variant="caption" tone="subtle" align={align}>
      {children}{' '}
      <AppText variant="caption" tone="muted" style={{ textDecorationLine: 'underline' }} onPress={() => router.push(`/legal/${doc}`)}>
        {label}
      </AppText>
    </AppText>
  );
}
