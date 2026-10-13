// Push delivery for web (RFC 8030/8291/8292), Firebase Cloud Messaging (Android)
// and Apple Push Notification service (iOS), using only WebCrypto and fetch so it
// runs unchanged in Supabase Edge Functions (Deno) and in Node for tests.

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Signs a JWT. ES256 keys give the raw r||s signature JWS expects. */
async function signJwt(header: object, claims: object, key: CryptoKey, alg: 'ES256' | 'RS256'): Promise<string> {
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const params = alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  const sig = await crypto.subtle.sign(params, key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

function pemToDer(pem: string): Uint8Array {
  return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
}

export interface Message {
  title: string;
  body: string;
  url: string;
}

export type SendResult = 'ok' | 'gone' | 'error';

function classify(status: number): SendResult {
  if (status >= 200 && status < 300) return 'ok';
  return status === 404 || status === 410 ? 'gone' : 'error';
}

// ---------------------------------------------------------------- web push

export interface VapidKeys {
  publicKey: string; // base64url, uncompressed P-256 point
  privateJwk: JsonWebKey;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

/** Encrypts a payload for one browser (RFC 8291, aes128gcm). */
export async function encryptWebPush(payload: Uint8Array, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: the payload followed by the 0x02 "last record" delimiter.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const jwt = await signJwt(
    { typ: 'JWT', alg: 'ES256' },
    { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject },
    key,
    'ES256',
  );
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth_secret: string },
  message: Message,
  keys: VapidKeys,
  subject: string,
): Promise<SendResult> {
  const body = await encryptWebPush(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth_secret);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
  await res.body?.cancel();
  return classify(res.status);
}

// ---------------------------------------------------------------- Firebase Cloud Messaging (Android)

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let fcmToken: { value: string; expires: number } | null = null;

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.expires > Date.now() + 60_000) return fcmToken.value;
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat, exp: iat + 3600 },
    key,
    'RS256',
  );
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const json = await res.json();
  fcmToken = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return fcmToken.value;
}

export async function sendFcm(token: string, message: Message, sa: ServiceAccount, apiBase = 'https://fcm.googleapis.com'): Promise<SendResult> {
  const res = await fetch(`${apiBase}/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: message.title, body: message.body },
        data: { url: message.url },
        android: { priority: 'high' },
      },
    }),
  });
  const text = await res.text();
  if (res.status === 404 || (res.status === 400 && text.includes('UNREGISTERED'))) return 'gone';
  return classify(res.status);
}

// ---------------------------------------------------------------- Apple Push Notification service (iOS)

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
  apiBase?: string;
}

let apnsJwt: { value: string; issued: number } | null = null;

async function apnsToken(cfg: ApnsConfig): Promise<string> {
  // Apple wants the token refreshed at most every 20–60 minutes.
  if (apnsJwt && Date.now() - apnsJwt.issued < 40 * 60_000) return apnsJwt.value;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(cfg.keyP8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const value = await signJwt({ alg: 'ES256', kid: cfg.keyId }, { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }, key, 'ES256');
  apnsJwt = { value, issued: Date.now() };
  return value;
}

export async function sendApns(deviceToken: string, message: Message, cfg: ApnsConfig): Promise<SendResult> {
  const base = cfg.apiBase ?? (cfg.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  const res = await fetch(`${base}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsToken(cfg)}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: 'default' }, url: message.url }),
  });
  const text = await res.text();
  if (res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(text))) return 'gone';
  return classify(res.status);
}

/** For tests: forget cached auth tokens. */
export function resetTokenCaches() {
  fcmToken = null;
  apnsJwt = null;
}
