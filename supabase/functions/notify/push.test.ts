// @vitest-environment node
import { createECDH, createPublicKey, generateKeyPairSync, KeyObject, randomBytes, verify as nodeVerify } from 'node:crypto';
// @ts-expect-error: no type definitions for http_ece
import ece from 'http_ece';
import { b64url, encryptWebPush, fromB64url, generateVapidKeys, resetTokenCaches, sendApns, sendFcm, sendWebPush, vapidAuthorization } from './push';

const message = { title: 'Bob prayed for you', body: 'Mum surgery on Friday', url: '/#/prayers/1' };

function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth) };
}

function decodeJwt(jwt: string) {
  const [h, c, s] = jwt.split('.');
  const dec = (x: string) => JSON.parse(Buffer.from(fromB64url(x)).toString());
  return { header: dec(h), claims: dec(c), signingInput: `${h}.${c}`, signature: Buffer.from(fromB64url(s)) };
}

/** Verifies an ES256 JWS (raw r||s signature) with Node's crypto, independent of WebCrypto. */
function verifyEs256(jwt: string, publicKey: KeyObject | Parameters<typeof createPublicKey>[0]): boolean {
  const { signingInput, signature } = decodeJwt(jwt);
  const key = publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);
  return nodeVerify('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' }, signature);
}

function ecPublicFromRaw(raw: Uint8Array) {
  return { key: { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)) }, format: 'jwk' as const };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCaches();
});

describe('web push', () => {
  it('encrypts payloads that a standard implementation can decrypt', async () => {
    const b = browserKeys();
    for (const text of ['hi', JSON.stringify(message), 'é'.repeat(1500)]) {
      const body = await encryptWebPush(new TextEncoder().encode(text), b.p256dh, b.auth);
      const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth });
      expect(plain.toString()).toBe(text);
    }
  });

  it('signs VAPID headers that verify against the public key', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://example.org', 1_700_000_000_000);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(m[2]).toBe(keys.publicKey);
    const { header: h, claims } = decodeJwt(m[1]);
    expect(h).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 12 * 3600, sub: 'https://example.org' });
    expect(verifyEs256(m[1], ecPublicFromRaw(fromB64url(keys.publicKey)))).toBe(true);
  });

  it('sends with the right headers and maps responses', async () => {
    const keys = await generateVapidKeys();
    const b = browserKeys();
    const calls: { url: string; init: RequestInit }[] = [];
    const statuses = [201, 410, 500];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: statuses[calls.length - 1] });
    });
    const sub = { endpoint: 'https://push.example/x', p256dh: b.p256dh, auth_secret: b.auth };
    expect(await sendWebPush(sub, message, keys, 'https://example.org')).toBe('ok');
    expect(await sendWebPush(sub, message, keys, 'https://example.org')).toBe('gone');
    expect(await sendWebPush(sub, message, keys, 'https://example.org')).toBe('error');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.TTL).toBe('86400');
    const plain = ece.decrypt(Buffer.from(calls[0].init.body as Uint8Array), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth });
    expect(JSON.parse(plain.toString())).toEqual(message);
  });
});

describe('Firebase Cloud Messaging', () => {
  it('authenticates with a signed service-account JWT and sends the message', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sa = {
      project_id: 'intercede-test',
      client_email: 'push@intercede-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: 'https://oauth.example/token',
    };
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === sa.token_uri) return Response.json({ access_token: 'tok-123', expires_in: 3600 });
      if (calls.length === 3) return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
      return Response.json({ name: 'projects/x/messages/1' });
    });

    expect(await sendFcm('device-token', message, sa, 'https://fcm.example')).toBe('ok');
    expect(await sendFcm('old-token', message, sa, 'https://fcm.example')).toBe('gone');
    expect(calls.filter((c) => c.url === sa.token_uri)).toHaveLength(1); // token is reused

    const assertion = new URLSearchParams(calls[0].init.body as URLSearchParams).get('assertion')!;
    const { header, claims, signingInput, signature } = decodeJwt(assertion);
    expect(header.alg).toBe('RS256');
    expect(claims).toMatchObject({ iss: sa.client_email, aud: sa.token_uri, scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    expect(nodeVerify('sha256', Buffer.from(signingInput), publicKey, signature)).toBe(true);

    expect(calls[1].url).toBe('https://fcm.example/v1/projects/intercede-test/messages:send');
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    const sent = JSON.parse(calls[1].init.body as string).message;
    expect(sent).toMatchObject({ token: 'device-token', notification: { title: message.title, body: message.body }, data: { url: message.url } });
  });
});

describe('Apple Push Notification service', () => {
  it('sends with a signed provider token and maps errors', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const cfg = {
      keyP8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'ABC123DEFG',
      teamId: 'TEAM123456',
      bundleId: 'app.intercede',
      production: true,
      apiBase: 'https://apns.example',
    };
    const calls: { url: string; init: RequestInit }[] = [];
    const replies = [new Response(null, { status: 200 }), new Response('{"reason":"BadDeviceToken"}', { status: 400 }), new Response('{"reason":"Unregistered"}', { status: 410 })];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return replies[calls.length - 1];
    });
    expect(await sendApns('aabbcc', message, cfg)).toBe('ok');
    expect(await sendApns('bad', message, cfg)).toBe('gone');
    expect(await sendApns('old', message, cfg)).toBe('gone');

    expect(calls[0].url).toBe('https://apns.example/3/device/aabbcc');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['apns-topic']).toBe('app.intercede');
    expect(h['apns-push-type']).toBe('alert');
    const jwt = h.authorization.replace('bearer ', '');
    const { header, claims } = decodeJwt(jwt);
    expect(header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(claims.iss).toBe('TEAM123456');
    expect(verifyEs256(jwt, publicKey)).toBe(true);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ aps: { alert: { title: message.title, body: message.body }, sound: 'default' }, url: message.url });
  });
});
