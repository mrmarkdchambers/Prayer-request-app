// @vitest-environment node
/**
 * Runs against a real Supabase (local: `npx supabase start`), checking the
 * privacy rules and sync end to end. Skipped unless SUPABASE_TEST_URL is set;
 * see `npm run test:integration`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as api from './api';
import { toRow } from './rows';
import { createPrayer } from '../lib/prayers';
import { reducer } from '../lib/reducer';
import { emptyData, type AppData } from '../lib/types';
import { pendingPush } from '../lib/sync';

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const run = Date.now().toString(36);

async function user(name: string): Promise<{ sb: SupabaseClient; id: string }> {
  const admin = createClient(URL!, SERVICE, opts);
  const email = `${name}-${run}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  if (created.error) throw created.error;
  const sb = createClient(URL!, ANON, opts);
  const signed = await sb.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (signed.error) throw signed.error;
  return { sb, id: created.data.user.id };
}

/** Simulates one device: local data plus a sync round (pull, then push). */
async function syncDevice(sb: SupabaseClient, userId: string, data: AppData): Promise<AppData> {
  data = reducer(data, { type: 'syncAttach', userId });
  data = reducer(data, { type: 'syncApply', rows: await api.pullChanges(sb, userId, data.sync!.cursor) });
  const res = await api.pushChanges(sb, userId, pendingPush(data));
  expect(res.failed).toEqual([]);
  return reducer(data, { type: 'syncPushed', pushed: res.pushed, deleted: res.deleted });
}

describe.skipIf(!URL)('Supabase backend', () => {
  let alice: { sb: SupabaseClient; id: string };
  let bob: { sb: SupabaseClient; id: string };
  let carol: { sb: SupabaseClient; id: string };
  let groupId: string;
  let invite: string;

  beforeAll(async () => {
    [alice, bob, carol] = await Promise.all([user('alice'), user('bob'), user('carol')]);
    await api.setDisplayName(carol.sb, carol.id, 'Carol');
  });

  it('creates a profile for each account', async () => {
    expect(await api.getDisplayName(alice.sb, alice.id)).toBe(''); // never derived from the email
    await api.setDisplayName(alice.sb, alice.id, '  Alice  ');
    expect(await api.getDisplayName(alice.sb, alice.id)).toBe('Alice');
  });

  it('syncs prayers between two devices, including deletes', async () => {
    let phone: AppData = { ...emptyData(), prayers: [createPrayer({ title: 'Made offline before signing in' })] };
    phone = await syncDevice(alice.sb, alice.id, phone);
    let laptop = await syncDevice(alice.sb, alice.id, emptyData());
    expect(laptop.prayers.map((p) => p.title)).toEqual(['Made offline before signing in']);

    const id = laptop.prayers[0].id;
    laptop = reducer(laptop, { type: 'addUpdate', id, text: 'Update from laptop' });
    laptop = await syncDevice(alice.sb, alice.id, laptop);
    phone = await syncDevice(alice.sb, alice.id, phone);
    expect(phone.prayers[0].updates.map((u) => u.text)).toEqual(['Update from laptop']);
    expect(pendingPush(phone)).toEqual({ upserts: [], deletes: [] }); // round-trips cleanly

    phone = reducer(phone, { type: 'delete', id });
    phone = await syncDevice(alice.sb, alice.id, phone);
    laptop = await syncDevice(alice.sb, alice.id, laptop);
    expect(laptop.prayers).toEqual([]);
  });

  it('syncs praise reports as praise, and old-style rows as requests', async () => {
    let phone: AppData = reducer(emptyData(), { type: 'add', input: { title: 'Thank you for rain', kind: 'praise' } });
    phone = await syncDevice(alice.sb, alice.id, phone);
    const laptop = await syncDevice(alice.sb, alice.id, emptyData());
    const synced = laptop.prayers.find((p) => p.title === 'Thank you for rain')!;
    expect(synced).toMatchObject({ kind: 'praise', status: 'answered' });
    expect(pendingPush(laptop)).toEqual({ upserts: [], deletes: [] });
    // Requests are sent without a kind, so they still sync with a database from before praise reports.
    expect(toRow(createPrayer({ title: 'r' }), alice.id)).not.toHaveProperty('kind');
    phone = reducer(phone, { type: 'delete', id: synced.id });
    await syncDevice(alice.sb, alice.id, phone);
  });

  it('lets people create and join groups by invite code', async () => {
    groupId = await api.createGroup(alice.sb, 'Tuesday small group');
    const [group] = await api.listGroups(alice.sb);
    invite = group.inviteCode;
    expect(invite).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(await api.joinGroup(bob.sb, invite)).toBe(groupId);
    expect(await api.joinGroup(bob.sb, invite)).toBe(groupId); // joining twice is fine
    await expect(api.joinGroup(carol.sb, 'not-a-code')).rejects.toThrow(/not valid/);

    const members = (await api.listGroups(bob.sb))[0].members;
    await api.setDisplayName(bob.sb, bob.id, 'Bob');
    expect(members.map((m) => [m.displayName, m.role])).toEqual([
      ['Alice', 'owner'],
      ['Someone', 'member'], // Bob hasn't chosen a name
    ]);
    expect(await api.listGroups(carol.sb)).toEqual([]);
  });

  it('keeps private prayers private and shares group prayers with members only', async () => {
    const priv = createPrayer({ title: 'Private worry' });
    const shared = createPrayer({ title: 'Mum surgery Friday', groupId });
    const res = await api.pushChanges(alice.sb, alice.id, { upserts: [priv, shared], deletes: [] });
    expect(res.failed).toEqual([]);

    const bobSees = await api.groupPrayers(bob.sb, groupId);
    expect(bobSees.map((p) => [p.title, p.ownerName])).toEqual([['Mum surgery Friday', 'Alice']]);
    // Members only get the shared view; the full row (follow-up dates, schedules, counts) stays private.
    const { data: bobAll } = await bob.sb.from('prayers').select('*');
    expect(bobAll).toEqual([]);
    const { data: view } = await bob.sb.rpc('group_requests', { gid: groupId });
    expect(Object.keys(view[0])).not.toContain('follow_up_on');
    expect(Object.keys(view[0])).not.toContain('prayed_count');
    expect(await api.groupPrayers(carol.sb, groupId)).toEqual([]);
    const { data: carolAll } = await carol.sb.from('prayers').select('title');
    expect(carolAll).toEqual([]);

    // Members can't edit someone else's request or post into a group they're not in.
    await bob.sb.from('prayers').update({ title: 'hacked' }).eq('id', shared.id);
    expect((await api.groupPrayers(alice.sb, groupId))[0].title).toBe('Mum surgery Friday');
    const sneaky = await carol.sb.from('prayers').insert(toRow(createPrayer({ title: 'spam', groupId }), carol.id));
    expect(sneaky.error).not.toBeNull();
    const impersonate = await carol.sb.from('prayers').insert(toRow(createPrayer({ title: 'fake' }), alice.id));
    expect(impersonate.error).not.toBeNull();
  });

  it('records "I prayed" once a day and tells the requester', async () => {
    const [shared] = await api.groupPrayers(bob.sb, groupId);
    await api.prayFor(bob.sb, shared.id, bob.id);
    await api.prayFor(bob.sb, shared.id, bob.id);
    const who = await api.intercessionsFor(alice.sb, shared.id);
    expect(who.map((i) => i.displayName)).toEqual(['Bob']);

    const today = new Date().toISOString().slice(0, 10);
    const forMe = await api.prayedForMe(alice.sb, alice.id, today);
    expect(forMe).toEqual([{ prayerId: shared.id, kind: 'request', title: 'Mum surgery Friday', people: ['Bob'] }]);

    await expect(api.prayFor(carol.sb, shared.id, carol.id)).rejects.toThrow();
    expect(await api.intercessionsFor(carol.sb, shared.id)).toEqual([]);
  });

  it('hides profiles from people outside your groups', async () => {
    const { data } = await carol.sb.from('profiles').select('display_name');
    expect(data?.map((r) => r.display_name)).toEqual(['Carol']);
  });

  it('unshares your requests when you leave a group', async () => {
    const bobShared = createPrayer({ title: "Bob's job interview", groupId });
    await api.pushChanges(bob.sb, bob.id, { upserts: [bobShared], deletes: [] });
    expect((await api.groupPrayers(alice.sb, groupId)).map((p) => p.title)).toContain("Bob's job interview");

    await api.removeMember(bob.sb, groupId, bob.id);
    expect((await api.groupPrayers(alice.sb, groupId)).map((p) => p.title)).not.toContain("Bob's job interview");
    const pulled = await api.pullChanges(bob.sb, bob.id, null);
    expect(pulled.find((p) => p.id === bobShared.id)?.groupId).toBeNull();
    expect(await api.groupPrayers(bob.sb, groupId)).toEqual([]);
  });

  it('only owners manage the group, and owners cannot leave', async () => {
    await api.joinGroup(carol.sb, invite);
    await api.renameGroup(carol.sb, groupId, 'hijacked');
    expect((await api.listGroups(alice.sb))[0].name).toBe('Tuesday small group');
    await expect(api.resetInviteCode(carol.sb, groupId)).rejects.toThrow(/owner/);

    await api.removeMember(alice.sb, groupId, alice.id); // silently refused
    expect((await api.listGroups(alice.sb))[0].members.some((m) => m.userId === alice.id)).toBe(true);

    const fresh = await api.resetInviteCode(alice.sb, groupId);
    expect(fresh).not.toBe(invite);
    await expect(api.joinGroup(bob.sb, invite)).rejects.toThrow(/not valid/);

    await api.removeMember(alice.sb, groupId, carol.id);
    expect(await api.listGroups(carol.sb)).toEqual([]);
  });

  it('turns shared prayers private when the group is deleted', async () => {
    await api.deleteGroup(alice.sb, groupId);
    expect(await api.listGroups(alice.sb)).toEqual([]);
    const pulled = await api.pullChanges(alice.sb, alice.id, null);
    expect(pulled.find((p) => p.title === 'Mum surgery Friday')?.groupId).toBeNull();
  });

  it('gives signed-out visitors nothing', async () => {
    const anon = createClient(URL!, ANON, opts);
    const { data } = await anon.from('prayers').select('*');
    expect(data ?? []).toEqual([]);
    const { error } = await anon.rpc('join_group', { code: invite });
    expect(error).not.toBeNull();
  });
});
