// @vitest-environment node
/**
 * End to end: database triggers queue notifications, the "notify" edge function
 * (running in Supabase's edge runtime) delivers them as encrypted web push to a
 * mock push service here, which decrypts and checks them. Skipped unless
 * SUPABASE_TEST_URL is set; see `npm run test:integration`.
 */
import { createServer, type Server } from 'node:http';
import { createECDH, createPublicKey, randomBytes, verify as nodeVerify, type ECDH } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// @ts-expect-error: no type definitions for http_ece
import ece from 'http_ece';
import * as api from './api';
import { createPrayer } from '../lib/prayers';

const URL_ = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';
// How the edge runtime's container reaches this machine.
const HOST = process.env.SUPABASE_TEST_HOST_FROM_FUNCTIONS ?? '172.18.0.1';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const run = Date.now().toString(36);

const b64url = (b: Buffer) => b.toString('base64url');

interface Received {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

let server: Server;
let port = 0;
const received: Received[] = [];

beforeAll(async () => {
  if (!URL_) return;
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = req.url?.includes('gone') ? 410 : 201;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server?.close());

async function user(name: string): Promise<{ sb: SupabaseClient; id: string }> {
  const admin = createClient(URL_!, SERVICE, opts);
  const email = `${name}-${run}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  if (created.error) throw created.error;
  const sb = createClient(URL_!, ANON, opts);
  const signed = await sb.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (signed.error) throw signed.error;
  await api.setDisplayName(sb, created.data.user.id, name[0].toUpperCase() + name.slice(1));
  return { sb, id: created.data.user.id };
}

/** A fake browser: its push keys, and an endpoint on the mock push service. */
function device(label: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { ecdh, endpoint: `http://${HOST}:${port}/push/${label}-${run}`, p256dh: b64url(ecdh.getPublicKey()), auth: b64url(randomBytes(16)) };
}

function messagesFor(d: { ecdh: ECDH; endpoint: string; auth: string }) {
  const path = new URL(d.endpoint).pathname;
  return received
    .filter((r) => r.path === path)
    .map((r) => JSON.parse(ece.decrypt(r.body, { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth }).toString()));
}

async function deliver(): Promise<{ reminders: number; notifications: number; sent: number; removed: number }> {
  const res = await fetch(`${URL_}/functions/v1/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: '{"action":"send"}' });
  expect(res.status).toBe(200);
  return res.json();
}

describe.skipIf(!URL_)('notifications', () => {
  let alice: { sb: SupabaseClient; id: string };
  let bob: { sb: SupabaseClient; id: string };
  let groupId: string;
  let sharedId: string;
  let alicePhone: ReturnType<typeof device>;
  let bobLaptop: ReturnType<typeof device>;

  beforeAll(async () => {
    // After the mock push service has its port.
    alicePhone = device('alice');
    bobLaptop = device('bob');
    [alice, bob] = await Promise.all([user('alice'), user('bob')]);
    groupId = await api.createGroup(alice.sb, 'Tuesday group');
    await api.joinGroup(bob.sb, (await api.listGroups(alice.sb))[0].inviteCode);
    await deliver(); // start from an empty queue
  });

  it('serves the web push public key', async () => {
    const key = await api.vapidPublicKey(alice.sb);
    expect(Buffer.from(key, 'base64url')).toHaveLength(65);
  });

  it('registers devices for the signed-in person only', async () => {
    await api.registerPush(alice.sb, 'web', alicePhone.endpoint, { p256dh: alicePhone.p256dh, auth: alicePhone.auth });
    await api.registerPush(bob.sb, 'web', bobLaptop.endpoint, { p256dh: bobLaptop.p256dh, auth: bobLaptop.auth });
    expect(await api.deviceCount(alice.sb)).toBe(1);
    expect(await api.deviceCount(bob.sb)).toBe(1);
    await expect(api.registerPush(alice.sb, 'web', 'https://x', undefined)).rejects.toThrow(/keys/);
    // The queue and server keys are off limits to app users.
    expect((await alice.sb.from('notifications').select('*')).error).not.toBeNull();
    expect((await alice.sb.from('push_keys').select('*')).error).not.toBeNull();
    expect((await alice.sb.rpc('claim_notifications')).error).not.toBeNull();
  });

  it('tells group members about a new request, encrypted end to end', async () => {
    const shared = createPrayer({ title: 'Mum surgery on Friday', groupId });
    sharedId = shared.id;
    await api.pushChanges(alice.sb, alice.id, { upserts: [shared], deletes: [] });
    const result = await deliver();
    expect(result.sent).toBe(1);
    expect(messagesFor(bobLaptop)).toEqual([{ title: 'New request in Tuesday group', body: 'Alice: Mum surgery on Friday', url: `/#/groups/${groupId}` }]);
    expect(messagesFor(alicePhone)).toEqual([]); // not to the person who shared it

    // Signed so the push service can trust it, with the key the app subscribes with.
    const auth = String(received.at(-1)!.headers.authorization);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth)!;
    expect(k).toBe(await api.vapidPublicKey(bob.sb));
    const [h, c, s] = jwt.split('.');
    const raw = Buffer.from(k, 'base64url');
    const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33)) }, format: 'jwk' });
    expect(nodeVerify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(c, 'base64url').toString()).aud).toBe(`http://${HOST}:${port}`);
  });

  it('tells you when someone prays for your request', async () => {
    await api.prayFor(bob.sb, sharedId, bob.id);
    await api.prayFor(bob.sb, sharedId, bob.id); // once a day only
    await deliver();
    expect(messagesFor(alicePhone)).toEqual([{ title: 'Bob prayed for you', body: 'Mum surgery on Friday', url: `/#/prayers/${sharedId}` }]);
  });

  it('shares answered prayers with the group', async () => {
    const [p] = (await api.pullChanges(alice.sb, alice.id, null)).filter((x) => x.id === sharedId);
    const answered = { ...p, status: 'answered' as const, answeredAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await api.pushChanges(alice.sb, alice.id, { upserts: [answered], deletes: [] });
    await api.pushChanges(alice.sb, alice.id, { upserts: [answered], deletes: [] }); // re-syncing doesn't repeat it
    await deliver();
    expect(messagesFor(bobLaptop).at(-1)).toEqual({ title: 'Answered prayer in Tuesday group', body: 'Alice: Mum surgery on Friday', url: `/#/groups/${groupId}` });
    expect(messagesFor(bobLaptop)).toHaveLength(2);
  });

  it('shares praise reports with the group, with a Praise God reaction', async () => {
    const praise = createPrayer({ title: 'Dad got the job!', kind: 'praise', groupId });
    await api.pushChanges(alice.sb, alice.id, { upserts: [praise], deletes: [] });
    await deliver();
    expect(messagesFor(bobLaptop).at(-1)).toEqual({ title: 'New praise report in Tuesday group', body: 'Alice: Dad got the job!', url: `/#/groups/${groupId}` });

    const seen = (await api.groupPrayers(bob.sb, groupId)).find((p) => p.id === praise.id)!;
    expect(seen).toMatchObject({ kind: 'praise', status: 'answered', title: 'Dad got the job!' });
    await api.prayFor(bob.sb, praise.id, bob.id);
    await deliver();
    expect(messagesFor(alicePhone).at(-1)).toEqual({ title: 'Bob is praising God with you', body: 'Dad got the job!', url: `/#/prayers/${praise.id}` });

    // Editing it later doesn't announce it again.
    await api.pushChanges(alice.sb, alice.id, { upserts: [{ ...praise, details: 'Starts Monday', updatedAt: new Date().toISOString() }], deletes: [] });
    expect(await deliver()).toMatchObject({ notifications: 0 });
  });

  it('respects notification settings', async () => {
    await api.saveNotificationSettings(bob.sb, bob.id, { ...api.DEFAULT_NOTIFICATION_SETTINGS, groupActivity: false });
    await api.pushChanges(alice.sb, alice.id, { upserts: [createPrayer({ title: 'Quiet one', groupId })], deletes: [] });
    expect(await deliver()).toMatchObject({ notifications: 0 });
    expect(await api.getNotificationSettings(bob.sb, bob.id)).toMatchObject({ groupActivity: false, prayedForMe: true });
    await expect(api.saveNotificationSettings(bob.sb, bob.id, { ...api.DEFAULT_NOTIFICATION_SETTINGS, timezone: 'Mars/Olympus' })).rejects.toThrow(/time zone/);
  });

  /**
   * A fixed-offset time zone where it's currently about `localHour` o'clock, so
   * these tests behave the same whatever time of day they run.
   */
  function zoneAt(localHour: number): { timezone: string; local: Date } {
    let offset = (localHour - new Date().getUTCHours() + 24) % 24;
    if (offset > 14) offset -= 24;
    // Etc/GMT zone names have the sign reversed: Etc/GMT-5 is UTC+5.
    const timezone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
    return { timezone, local: new Date(Date.now() + offset * 3600_000) };
  }
  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

  it('sends the daily reminder once, at the chosen local time', async () => {
    const { timezone, local } = zoneAt(12);
    const reminderTime = hhmm(new Date(local.getTime() - 5 * 60_000));
    await api.saveNotificationSettings(alice.sb, alice.id, { ...api.DEFAULT_NOTIFICATION_SETTINGS, dailyReminder: true, reminderTime, timezone });
    // Turning it on after today's time has passed doesn't fire one straight away.
    expect(await deliver()).toMatchObject({ reminders: 0 });

    const admin = createClient(URL_!, SERVICE, opts);
    await admin.from('notification_settings').update({ last_reminded_on: '2000-01-01' }).eq('user_id', alice.id);
    expect(await deliver()).toMatchObject({ reminders: 1, sent: 1 });
    expect(messagesFor(alicePhone).at(-1)).toEqual({ title: 'Time to pray', body: 'Your prayers for today are ready.', url: '/#/session' });
    expect(await deliver()).toMatchObject({ reminders: 0 });
  });

  it('sends a late-evening reminder even when delivery runs just after midnight', async () => {
    // It's about 00:mm locally and the reminder was set for 23:50 the evening before.
    const { timezone } = zoneAt(0);
    const admin = createClient(URL_!, SERVICE, opts);
    await admin.from('notification_settings').update({ reminder_time: '23:50', timezone }).eq('user_id', alice.id);
    // Changing the time marks the most recent one as already sent; pretend it wasn't.
    await admin.from('notification_settings').update({ last_reminded_on: '2000-01-01' }).eq('user_id', alice.id);
    expect(await deliver()).toMatchObject({ reminders: 1 });
    expect(await deliver()).toMatchObject({ reminders: 0 });
  });

  it('forgets devices the push service says are gone', async () => {
    const stale = device('gone');
    await api.registerPush(bob.sb, 'web', stale.endpoint, { p256dh: stale.p256dh, auth: stale.auth });
    expect(await api.deviceCount(bob.sb)).toBe(2);
    await api.prayFor(alice.sb, (await api.groupPrayers(alice.sb, groupId)).find((p) => p.title === 'Quiet one')!.id, alice.id);
    // Alice praying for her own request notifies no one; have Bob share one Alice prays for instead.
    const bobs = createPrayer({ title: 'Job interview', groupId });
    await api.pushChanges(bob.sb, bob.id, { upserts: [bobs], deletes: [] });
    await api.prayFor(alice.sb, bobs.id, alice.id);
    const result = await deliver();
    expect(result.removed).toBe(1);
    expect(await api.deviceCount(bob.sb)).toBe(1);
    expect(messagesFor(bobLaptop).at(-1)).toMatchObject({ title: 'Alice prayed for you', body: 'Job interview' });
  });

  it('moves a device to whoever signs in on it next', async () => {
    await api.registerPush(alice.sb, 'web', bobLaptop.endpoint, { p256dh: bobLaptop.p256dh, auth: bobLaptop.auth });
    expect(await api.deviceCount(bob.sb)).toBe(0);
    expect(await api.deviceCount(alice.sb)).toBe(2);
    await api.unregisterPush(alice.sb, bobLaptop.endpoint);
    expect(await api.deviceCount(alice.sb)).toBe(1);
  });

  it('deletes an account, handing the group to another member', async () => {
    await api.deleteAccount(alice.sb);
    const groups = await api.listGroups(bob.sb);
    expect(groups.map((g) => [g.name, g.members.map((m) => [m.displayName, m.role])])).toEqual([['Tuesday group', [['Bob', 'owner']]]]);
    const admin = createClient(URL_!, SERVICE, opts);
    expect((await admin.auth.admin.getUserById(alice.id)).data.user).toBeNull();
    expect((await admin.from('prayers').select('id').eq('owner_id', alice.id)).data).toEqual([]);
    expect((await admin.from('push_subscriptions').select('id').eq('user_id', alice.id)).data).toEqual([]);

    // A solo group disappears with its only member.
    const solo = await api.createGroup(bob.sb, 'Just me');
    await api.deleteAccount(bob.sb);
    expect((await admin.from('groups').select('name').in('id', [groupId, solo])).data).toEqual([]);
  });
});
