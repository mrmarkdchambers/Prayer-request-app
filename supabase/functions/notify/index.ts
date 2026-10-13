// Delivers queued notifications. Called every minute by a cron job
// (body {"action":"send"}), and by the app to fetch the web push public key
// (body {"action":"vapid"}). Both are safe for anyone to call: sending only
// delivers what the database already queued, and the public key is public.

import { generateVapidKeys, sendApns, sendFcm, sendWebPush, type ApnsConfig, type Message, type SendResult, type ServiceAccount, type VapidKeys } from './push.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
// Push services require a contact for the sender.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://prayerrequestapp.netlify.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function db(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Database request failed (${res.status}): ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

let vapidCache: VapidKeys | null = null;

async function vapidKeys(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const rows = await json<{ public_key: string; private_jwk: JsonWebKey }[]>(await db('push_keys?select=public_key,private_jwk&id=eq.1'));
  if (!rows.length) {
    const fresh = await generateVapidKeys();
    // If two runs race, the first insert wins and both read it back.
    await db('push_keys', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: 1, public_key: fresh.publicKey, private_jwk: fresh.privateJwk }),
    });
    return vapidKeys();
  }
  vapidCache = { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk };
  return vapidCache;
}

function fcmConfig(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  return raw ? JSON.parse(raw) : null;
}

function apnsConfig(): ApnsConfig | null {
  const keyP8 = Deno.env.get('APNS_KEY');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  if (!keyP8 || !keyId || !teamId || !bundleId) return null;
  return { keyP8, keyId, teamId, bundleId, production: Deno.env.get('APNS_PRODUCTION') !== 'false', apiBase: Deno.env.get('APNS_API_BASE') };
}

interface Subscription {
  id: string;
  user_id: string;
  kind: 'web' | 'fcm' | 'apns';
  endpoint: string;
  p256dh: string | null;
  auth_secret: string | null;
  failures: number;
}

interface Queued extends Message {
  id: number;
  user_id: string;
}

async function deliver(): Promise<{ reminders: number; notifications: number; sent: number; removed: number }> {
  const reminders = await json<number>(await db('rpc/enqueue_reminders', { method: 'POST', body: '{}' }));
  const queued = await json<Queued[]>(await db('rpc/claim_notifications', { method: 'POST', body: JSON.stringify({ batch: 200 }) }));
  if (!queued.length) return { reminders, notifications: 0, sent: 0, removed: 0 };

  const users = [...new Set(queued.map((n) => n.user_id))];
  const subs = await json<Subscription[]>(await db(`push_subscriptions?select=*&user_id=in.(${users.join(',')})`));
  const fcm = fcmConfig();
  const apns = apnsConfig();
  const fcmBase = Deno.env.get('FCM_API_BASE') ?? undefined;
  const keys = subs.some((s) => s.kind === 'web') ? await vapidKeys() : null;

  const delivered: number[] = [];
  const gone = new Set<string>();
  const ok = new Set<string>();
  const failed = new Set<string>();
  let sent = 0;

  await Promise.all(
    queued.map(async (n) => {
      const message: Message = { title: n.title, body: n.body, url: n.url };
      const targets = subs.filter((s) => s.user_id === n.user_id);
      let anyOk = false;
      let anyRetry = false;
      await Promise.all(
        targets.map(async (s) => {
          let result: SendResult = 'error';
          try {
            if (s.kind === 'web' && keys && s.p256dh && s.auth_secret) result = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth_secret: s.auth_secret }, message, keys, VAPID_SUBJECT);
            else if (s.kind === 'fcm' && fcm) result = await sendFcm(s.endpoint, message, fcm, fcmBase);
            else if (s.kind === 'apns' && apns) result = await sendApns(s.endpoint, message, apns);
            else return; // that channel isn't set up on the server yet
          } catch (err) {
            console.error(`push to ${s.kind} failed`, err);
          }
          if (result === 'ok') {
            anyOk = true;
            sent++;
            ok.add(s.id);
          } else if (result === 'gone') gone.add(s.id);
          else {
            anyRetry = true;
            failed.add(s.id);
          }
        }),
      );
      // Done unless a device had a temporary problem and nothing else got it.
      if (anyOk || !anyRetry) delivered.push(n.id);
    }),
  );

  const now = new Date().toISOString();
  const updates: Promise<unknown>[] = [];
  if (delivered.length) updates.push(db(`notifications?id=in.(${delivered.join(',')})`, { method: 'PATCH', body: JSON.stringify({ sent_at: now }) }));
  if (gone.size) updates.push(db(`push_subscriptions?id=in.(${[...gone].join(',')})`, { method: 'DELETE' }));
  if (ok.size) updates.push(db(`push_subscriptions?id=in.(${[...ok].join(',')})`, { method: 'PATCH', body: JSON.stringify({ last_success_at: now, failures: 0 }) }));
  for (const id of failed) {
    const s = subs.find((x) => x.id === id)!;
    // A device that keeps failing for days is dropped.
    if (s.failures >= 50) updates.push(db(`push_subscriptions?id=eq.${id}`, { method: 'DELETE' }));
    else updates.push(db(`push_subscriptions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ failures: s.failures + 1 }) }));
  }
  updates.push(db('rpc/prune_notifications', { method: 'POST', body: '{}' }));
  await Promise.all(updates);
  return { reminders, notifications: queued.length, sent, removed: gone.size };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { action = 'send' } = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const result = action === 'vapid' ? { publicKey: (await vapidKeys()).publicKey } : await deliver();
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
