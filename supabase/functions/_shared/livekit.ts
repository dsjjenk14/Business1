/** LiveKit access tokens (JWTs signed with HS256), shared by live video and event rooms. */
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

export function livekitConfig() {
  const url = Deno.env.get('LIVEKIT_URL') ?? '';
  const key = Deno.env.get('LIVEKIT_API_KEY') ?? '';
  const secret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
  // wss:// in production; ws:// only for a local test server.
  const ok = (url.startsWith('wss://') || (url.startsWith('ws://') && Deno.env.get('IMIN_ENV') !== 'production')) && !!key && !!secret;
  return ok ? { url, key, secret } : null;
}

export async function livekitToken(opts: {
  key: string;
  secret: string;
  identity: string;
  name: string;
  room: string;
  ttlSec: number;
  canPublish: boolean;
  /** Limit what can be sent, e.g. ['microphone'] for a voice room. */
  canPublishSources?: string[];
  /** Chat and reactions inside the room. */
  canPublishData?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: opts.key,
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + opts.ttlSec,
    video: {
      room: opts.room,
      roomJoin: true,
      canPublish: opts.canPublish,
      canSubscribe: true,
      canPublishData: opts.canPublishData ?? false,
      ...(opts.canPublishSources ? { canPublishSources: opts.canPublishSources } : {}),
    },
  };
  const body = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const k = await crypto.subtle.importKey('raw', enc.encode(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}
