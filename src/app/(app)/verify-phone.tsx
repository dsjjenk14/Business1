import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type StartResponse = { sent?: boolean; demo?: boolean; phoneLast4?: string; demoCode?: string; alreadyVerified?: boolean; error?: string };

async function invokeFn<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // Function errors carry a JSON body with a human message.
    const context = (error as { context?: Response }).context;
    const parsed = context ? await context.json().catch(() => null) : null;
    throw new Error(parsed?.error ?? "Something went wrong. Try again.");
  }
  return data as T;
}

/** Text a 6-digit code to the member's phone and confirm it. */
export default function VerifyPhone() {
  const t = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<StartResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);

  const requestCode = () =>
    invokeFn<StartResponse>('phone-verify-start', {}).then(
      (res) => {
        if (res.alreadyVerified) setDone(true);
        setStatus(res);
        setBusy(false);
      },
      (e: Error) => {
        setError(e.message);
        setBusy(false);
      },
    );

  function send() {
    setError(null);
    setBusy(true);
    requestCode();
  }

  // Send the first code as soon as the screen opens.
  useEffect(() => {
    requestCode();
  }, []);

  async function check() {
    setError(null);
    setBusy(true);
    try {
      await invokeFn('phone-verify-check', { code });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackHeader title="Verify phone" />
      <Screen contentGap={t.space[5]}>
        {done ? (
          <>
            <AppText variant="h2">Phone verified ✓</AppText>
            <AppText tone="muted">Thanks. A verified number makes your account more trusted.</AppText>
            <Button label="Done" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <AppText tone="muted">
              {status?.phoneLast4 ? `We texted a 6-digit code to the number ending in ${status.phoneLast4}.` : 'Sending your code…'}
            </AppText>
            {status?.demoCode ? (
              <Card accent="sponsored">
                <AppText variant="label" tone="sponsored">
                  Demo mode
                </AppText>
                <AppText variant="small" tone="muted">
                  Texting isn&apos;t connected yet, so no SMS was sent. Your code is{' '}
                  <AppText weight="bold" tone="text">
                    {status.demoCode}
                  </AppText>
                  . This box never appears in production.
                </AppText>
              </Card>
            ) : null}
            <TextField
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              placeholder="123456"
              error={error}
              onSubmitEditing={check}
            />
            <Button label="Verify" onPress={check} loading={busy} disabled={code.length !== 6} />
            <Button label="Send a new code" variant="ghost" onPress={send} disabled={busy} />
          </>
        )}
      </Screen>
    </>
  );
}
