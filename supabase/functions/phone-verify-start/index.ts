/**
 * Sends a 6-digit code to the signed-in member's phone number.
 * Uses Twilio when configured; otherwise demo mode (see _shared/sms.ts).
 */
import { adminCount, adminRest, configNumber, corsHeaders, enc, getCaller, json, sha256 } from '../_shared/http.ts';
import { isProduction, sendSms } from '../_shared/sms.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: 'Sign in first.' }, 401);

  const { data: rows } = await adminRest<{ phone: string | null; phone_verified_at: string | null }[]>(
    `profile_private?select=phone,phone_verified_at&id=eq.${user.id}`,
  );
  const priv = rows?.[0];
  if (!priv?.phone) return json({ error: 'Add a phone number to your account first.' }, 400);
  if (priv.phone_verified_at) return json({ alreadyVerified: true });

  const perHour = await configNumber('sms_codes_per_hour', 5);
  const sentLastHour = await adminCount('phone_verifications', `user_id=eq.${user.id}&created_at=gte.${enc(new Date(Date.now() - 3_600_000).toISOString())}`);
  if (sentLastHour >= perHour) return json({ error: 'Too many codes sent. Try again in an hour.' }, 429);

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
  const ttl = await configNumber('sms_code_ttl_min', 10);
  await adminRest('phone_verifications', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      user_id: user.id,
      phone: priv.phone,
      code_hash: await sha256(`${user.id}:${code}`),
      expires_at: new Date(Date.now() + ttl * 60_000).toISOString(),
    },
  });

  try {
    const result = await sendSms(priv.phone, `Your I'm In code is ${code}. It expires in ${ttl} minutes. Don't share it with anyone.`);
    return json({
      sent: result.sent,
      demo: result.demo,
      phoneLast4: priv.phone.slice(-4),
      // Only in demo mode outside production, so the flow can be tested without Twilio.
      demoCode: result.demo && !isProduction() ? code : undefined,
    });
  } catch {
    return json({ error: "We couldn't send a text right now. Try again shortly." }, 502);
  }
});
