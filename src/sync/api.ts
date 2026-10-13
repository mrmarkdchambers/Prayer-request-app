import type { SupabaseClient } from '@supabase/supabase-js';
import type { Prayer, PrayerUpdate, Status } from '../lib/types';
import type { PushSet, RemotePrayer } from '../lib/sync';
import { fromRow, toRow, tombstoneRow, type PrayerRow } from './rows';

const PAGE = 500;
/** Re-read a little before the cursor in case a slow write committed late. Re-applying is harmless. */
const OVERLAP_MS = 60_000;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---------------------------------------------------------------- sync

export async function pullChanges(sb: SupabaseClient, userId: string, cursor: string | null): Promise<RemotePrayer[]> {
  const out: RemotePrayer[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('prayers').select('*').eq('owner_id', userId);
    if (cursor) q = q.gt('server_updated_at', new Date(Date.parse(cursor) - OVERLAP_MS).toISOString());
    const rows = check(await q.order('server_updated_at').order('id').range(from, from + PAGE - 1)) as PrayerRow[];
    out.push(...rows.map(fromRow));
    if (rows.length < PAGE) return out;
  }
}

export interface PushResult {
  pushed: Prayer[];
  deleted: string[];
  failed: Prayer[];
}

export async function pushChanges(sb: SupabaseClient, userId: string, set: PushSet): Promise<PushResult> {
  const result: PushResult = { pushed: [], deleted: [], failed: [] };
  for (let i = 0; i < set.upserts.length; i += PAGE) {
    const chunk = set.upserts.slice(i, i + PAGE);
    const { error } = await sb.from('prayers').upsert(chunk.map((p) => toRow(p, userId)));
    if (!error) {
      result.pushed.push(...chunk);
      continue;
    }
    // One bad row (e.g. shared with a group you've since left) shouldn't block the rest.
    for (const p of chunk) {
      const { error: rowError } = await sb.from('prayers').upsert(toRow(p, userId));
      (rowError ? result.failed : result.pushed).push(p);
    }
  }
  if (set.deletes.length) {
    check(await sb.from('prayers').upsert(set.deletes.map((id) => tombstoneRow(id, userId))));
    result.deleted.push(...set.deletes);
  }
  return result;
}

// ---------------------------------------------------------------- profile

export async function getDisplayName(sb: SupabaseClient, userId: string): Promise<string> {
  const row = check(await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle()) as { display_name: string } | null;
  return row?.display_name ?? '';
}

export async function setDisplayName(sb: SupabaseClient, userId: string, name: string): Promise<void> {
  check(await sb.from('profiles').update({ display_name: name.trim().slice(0, 60) }).eq('id', userId));
}

// ---------------------------------------------------------------- groups

export interface Member {
  userId: string;
  role: 'owner' | 'member';
  displayName: string;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  members: Member[];
}

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  group_members: { user_id: string; role: 'owner' | 'member'; profiles: { display_name: string } | null }[];
}

export async function listGroups(sb: SupabaseClient): Promise<Group[]> {
  const rows = check(
    await sb.from('groups').select('id, name, invite_code, group_members(user_id, role, profiles(display_name))').order('created_at'),
  ) as unknown as GroupRow[];
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    inviteCode: g.invite_code,
    members: g.group_members
      .map((m) => ({ userId: m.user_id, role: m.role, displayName: m.profiles?.display_name || 'Someone' }))
      .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'owner' ? -1 : 1)),
  }));
}

export async function createGroup(sb: SupabaseClient, name: string): Promise<string> {
  const g = check(await sb.rpc('create_group', { group_name: name })) as { id: string };
  return g.id;
}

export async function joinGroup(sb: SupabaseClient, code: string): Promise<string> {
  return check(await sb.rpc('join_group', { code })) as string;
}

export async function removeMember(sb: SupabaseClient, groupId: string, userId: string): Promise<void> {
  check(await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}

export async function renameGroup(sb: SupabaseClient, groupId: string, name: string): Promise<void> {
  check(await sb.from('groups').update({ name: name.trim() }).eq('id', groupId));
}

export async function deleteGroup(sb: SupabaseClient, groupId: string): Promise<void> {
  check(await sb.from('groups').delete().eq('id', groupId));
}

export async function resetInviteCode(sb: SupabaseClient, groupId: string): Promise<string> {
  return check(await sb.rpc('reset_invite_code', { gid: groupId })) as string;
}

// ---------------------------------------------------------------- shared prayers

export interface Intercession {
  userId: string;
  prayedOn: string;
  displayName: string;
}

export interface SharedPrayer {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  details: string;
  person: string;
  tags: string[];
  status: Status;
  answeredAt: string | null;
  answerNote: string;
  updates: PrayerUpdate[];
  createdAt: string;
  updatedAt: string;
  intercessions: Intercession[];
}

interface SharedRow {
  id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  details: string;
  person: string;
  tags: string[];
  status: Status;
  answered_at: string | null;
  answer_note: string;
  updates: PrayerUpdate[];
  created_at: string;
  updated_at: string;
  intercessions: { user_id: string; prayed_on: string; display_name: string }[];
}

/** A group's requests, limited to what members are allowed to see. */
export async function groupPrayers(sb: SupabaseClient, groupId: string): Promise<SharedPrayer[]> {
  const rows = check(await sb.rpc('group_requests', { gid: groupId })) as SharedRow[];
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name || 'Someone',
    title: r.title,
    details: r.details,
    person: r.person,
    tags: r.tags,
    status: r.status,
    answeredAt: r.answered_at,
    answerNote: r.answer_note,
    updates: r.updates,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    intercessions: r.intercessions.map((i) => ({ userId: i.user_id, prayedOn: i.prayed_on, displayName: i.display_name || 'Someone' })),
  }));
}

/** Records "I prayed" for someone's request; repeat taps on the same day count once. */
export async function prayFor(sb: SupabaseClient, prayerId: string, userId: string): Promise<void> {
  check(
    await sb
      .from('intercessions')
      .upsert({ prayer_id: prayerId, user_id: userId }, { onConflict: 'prayer_id,user_id,prayed_on', ignoreDuplicates: true }),
  );
}

export async function intercessionsFor(sb: SupabaseClient, prayerId: string): Promise<Intercession[]> {
  const rows = check(
    await sb.from('intercessions').select('user_id, prayed_on, profiles(display_name)').eq('prayer_id', prayerId).order('prayed_on', { ascending: false }),
  ) as unknown as { user_id: string; prayed_on: string; profiles: { display_name: string } | null }[];
  return rows.map((i) => ({ userId: i.user_id, prayedOn: i.prayed_on, displayName: i.profiles?.display_name || 'Someone' }));
}

export interface PrayedForYou {
  prayerId: string;
  title: string;
  people: string[];
}

/** Who has prayed for your requests since a given day, grouped by request. */
export async function prayedForMe(sb: SupabaseClient, userId: string, sinceDay: string): Promise<PrayedForYou[]> {
  const rows = check(
    await sb
      .from('intercessions')
      .select('prayer_id, user_id, profiles(display_name), prayers!inner(title, owner_id)')
      .eq('prayers.owner_id', userId)
      .neq('user_id', userId)
      .gte('prayed_on', sinceDay),
  ) as unknown as { prayer_id: string; user_id: string; profiles: { display_name: string } | null; prayers: { title: string } }[];
  const byPrayer = new Map<string, PrayedForYou>();
  for (const r of rows) {
    const entry = byPrayer.get(r.prayer_id) ?? { prayerId: r.prayer_id, title: r.prayers.title, people: [] };
    const name = r.profiles?.display_name || 'Someone';
    if (!entry.people.includes(name)) entry.people.push(name);
    byPrayer.set(r.prayer_id, entry);
  }
  return [...byPrayer.values()];
}

// ---------------------------------------------------------------- notifications

export interface NotificationSettings {
  prayedForMe: boolean;
  groupActivity: boolean;
  dailyReminder: boolean;
  reminderTime: string; // HH:MM
  timezone: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  prayedForMe: true,
  groupActivity: true,
  dailyReminder: false,
  reminderTime: '07:30',
  timezone: 'UTC',
};

export async function getNotificationSettings(sb: SupabaseClient, userId: string): Promise<NotificationSettings | null> {
  const row = check(
    await sb.from('notification_settings').select('prayed_for_me, group_activity, daily_reminder, reminder_time, timezone').eq('user_id', userId).maybeSingle(),
  ) as { prayed_for_me: boolean; group_activity: boolean; daily_reminder: boolean; reminder_time: string; timezone: string } | null;
  if (!row) return null;
  return {
    prayedForMe: row.prayed_for_me,
    groupActivity: row.group_activity,
    dailyReminder: row.daily_reminder,
    reminderTime: row.reminder_time.slice(0, 5),
    timezone: row.timezone,
  };
}

export async function saveNotificationSettings(sb: SupabaseClient, userId: string, s: NotificationSettings): Promise<void> {
  check(
    await sb.from('notification_settings').upsert({
      user_id: userId,
      prayed_for_me: s.prayedForMe,
      group_activity: s.groupActivity,
      daily_reminder: s.dailyReminder,
      reminder_time: s.reminderTime,
      timezone: s.timezone,
    }),
  );
}

export type PushKind = 'web' | 'fcm' | 'apns';

/** Links this device to the signed-in account (taking it over from anyone who used it before). */
export async function registerPush(sb: SupabaseClient, kind: PushKind, endpoint: string, keys?: { p256dh: string; auth: string }): Promise<void> {
  check(await sb.rpc('register_push', { kind, endpoint, p256dh: keys?.p256dh ?? null, auth_secret: keys?.auth ?? null }));
}

export async function unregisterPush(sb: SupabaseClient, endpoint: string): Promise<void> {
  check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

export async function deviceCount(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb.from('push_subscriptions').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** The server's public key for web push subscriptions. */
export async function vapidPublicKey(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.functions.invoke('notify', { body: { action: 'vapid' } });
  if (error || !data?.publicKey) throw new Error('Notifications are not available right now');
  return data.publicKey as string;
}

/** Permanently deletes the account and everything in it. Groups you lead pass to another member. */
export async function deleteAccount(sb: SupabaseClient): Promise<void> {
  check(await sb.rpc('delete_account'));
}
