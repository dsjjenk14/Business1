/**
 * SMS sending, behind one small interface so the rest of the code never talks
 * to Twilio directly.
 *
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
