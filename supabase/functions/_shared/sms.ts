/**
 * SMS sending, behind one small interface so the rest of the code never talks
 * to Twilio directly.
 *
 * - With TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID set:
 *   phone verification uses Twilio Verify, which makes, texts and checks the code.
 *   No phone number to buy and no carrier registration to file.
 * - With TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER set: sends real texts.
 * - Without them: "demo mode". Nothing is sent; the message is logged. Outside
 *   production, callers may show the demo code on screen so the flow can be tested.
 */

export type SmsResult = { sent: boolean; demo: boolean; id?: string };

export function smsConfigured(): boolean {
  return !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_FROM_NUMBER'));
}

export function isProduction(): boolean {
  return Deno.env.get('IMIN_ENV') === 'production';
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) {
    if (isProduction()) throw new Error('SMS is not configured.');
    console.log(`[sms demo] to=${to.slice(0, -4)}**** body=${JSON.stringify(body)}`);
    return { sent: false, demo: true };
  }

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const from = Deno.env.get('TWILIO_FROM_NUMBER')!;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('[sms] Twilio error', res.status, detail);
    throw new Error('Could not send text message.');
  }
  const json = await res.json();
  return { sent: true, demo: false, id: json.sid };
}

// ── Twilio Verify ────────────────────────────────────────────────────────────

export function verifyConfigured(): boolean {
  return !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_VERIFY_SERVICE_SID'));
}

/** A problem the member can fix (wrong number, too many tries), with a message to show them. */
export class VerifyUserError extends Error {}

async function verifyRequest(path: string, params: Record<string, string>): Promise<Response> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const service = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!;
  return await fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
}

/** Texts a code to the number. Twilio makes the code; we never see it. */
export async function startVerification(to: string): Promise<void> {
  const res = await verifyRequest('Verifications', { To: to, Channel: 'sms' });
  if (res.ok) return;
  const detail = await res.json().catch(() => ({}));
  console.error('[verify] start error', res.status, detail?.code);
  if (detail?.code === 60200 || detail?.code === 60205) {
    throw new VerifyUserError("That phone number can't get texts. Check it in Settings, Edit profile.");
  }
  if (res.status === 429 || detail?.code === 60203) throw new VerifyUserError('Too many codes sent. Try again in an hour.');
  throw new Error('Could not start verification.');
}

/** True if the code is right for that number. False if wrong, expired or already used. */
export async function checkVerification(to: string, code: string): Promise<boolean> {
  const res = await verifyRequest('VerificationCheck', { To: to, Code: code });
  if (res.status === 404) return false; // expired, used up, or never started
  const detail = await res.json().catch(() => ({}));
  if (res.status === 429 || detail?.code === 60202) throw new VerifyUserError('Too many wrong tries. Send a new code.');
  if (!res.ok) {
    console.error('[verify] check error', res.status, detail?.code);
    throw new Error('Could not check the code.');
  }
  return detail?.status === 'approved';
}
