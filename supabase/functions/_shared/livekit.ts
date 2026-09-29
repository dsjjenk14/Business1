/** LiveKit: access tokens (JWTs signed with HS256) and server messages, shared by live video and event rooms. */
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

async function signJwt(payload: unknown, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

function grant(key: string, identity: string, name: string, ttlSec: number, video: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: key, sub: identity, name, nbf: now - 10, exp: now + ttlSec, video };
}

export function livekitToken(opts: {
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
  return signJwt(
    grant(opts.key, opts.identity, opts.name, opts.ttlSec, {
      room: opts.room,
      roomJoin: true,
      canPublish: opts.canPublish,
      canSubscribe: true,
      canPublishData: opts.canPublishData ?? false,
      ...(opts.canPublishSources ? { canPublishSources: opts.canPublishSources } : {}),
    }),
    opts.secret,
  );
}

/**
 * Tell everyone in a room something (e.g. "Ana sent a Margarita"), from the
 * server, so every viewer sees it however they joined. Best effort.
 */
export async function livekitSendData(room: string, message: unknown): Promise<boolean> {
  const cfg = livekitConfig();
  if (!cfg) return false;
  const token = await signJwt(grant(cfg.key, 'imin-server', 'I’m In', 60, { room, roomAdmin: true }), cfg.secret);
  const data = btoa(String.fromCharCode(...enc.encode(JSON.stringify(message))));
  // The server's own address for LiveKit (only differs from the app's in local tests).
  const api = Deno.env.get('LIVEKIT_API_URL') || cfg.url.replace(/^ws/, 'http');
  const res = await fetch(`${api}/twirp/livekit.RoomService/SendData`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, data, kind: 'RELIABLE' }),
  }).catch(() => null);
  return !!res?.ok;
}
