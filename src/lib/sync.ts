import type { AppData, Prayer } from './types';

/**
 * Sync rules (pure functions; the network side lives in src/sync/).
 *
 * The device keeps a hash of each prayer as last agreed with the server.
 * - Push: any prayer whose hash changed, plus any agreed prayer that's gone locally (a delete).
 * - Pull: a remote change replaces the local copy if the local copy hasn't been
 *   edited since the last sync; if both changed, the most recent change wins.
 */

export interface RemotePrayer extends Prayer {
  deleted: boolean;
  serverUpdatedAt: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function prayerHash(p: Prayer): string {
  return stable(p);
}

/** When this prayer last changed on its device, counting "I prayed" taps. */
export function changedAt(p: Prayer): string {
  return p.lastPrayedAt && p.lastPrayedAt > p.updatedAt ? p.lastPrayedAt : p.updatedAt;
}

/**
 * Connects local data to an account. Prayers made while signed out are kept
 * and uploaded to the account; if the data belonged to a different account,
 * it's cleared first (that account still has it on the server).
 */
export function attachAccount(data: AppData, userId: string): { data: AppData; migrated: number } {
  if (data.sync?.userId === userId) return { data, migrated: 0 };
  const prayers = data.sync ? [] : data.prayers;
  return { data: { ...data, prayers, sync: { userId, cursor: null, hashes: {} } }, migrated: prayers.length };
}

/** Signing out removes this account's prayers from the device; they stay safe on the server. */
export function detachAccount(data: AppData): AppData {
  return { version: 1, settings: data.settings, prayers: [] };
}

export function applyRemote(data: AppData, rows: RemotePrayer[]): AppData {
  if (!data.sync || rows.length === 0) return data;
  const hashes = { ...data.sync.hashes };
  const byId = new Map(data.prayers.map((p) => [p.id, p]));
  let cursor = data.sync.cursor;

  for (const row of rows) {
    if (!cursor || Date.parse(row.serverUpdatedAt) > Date.parse(cursor)) cursor = row.serverUpdatedAt;
    const { deleted, serverUpdatedAt: _s, ...remote } = row;
    const local = byId.get(row.id);
    if (deleted) {
      byId.delete(row.id);
      delete hashes[row.id];
      continue;
    }
    if (!local) {
      // Known to this device but missing locally means it was deleted here and the delete is waiting to upload.
      if (row.id in hashes) continue;
      byId.set(row.id, remote);
      hashes[row.id] = prayerHash(remote);
      continue;
    }
    const localUnchanged = prayerHash(local) === hashes[row.id];
    if (localUnchanged || changedAt(remote) > changedAt(local)) {
      byId.set(row.id, remote);
      hashes[row.id] = prayerHash(remote);
    }
  }
  return { ...data, prayers: [...byId.values()], sync: { ...data.sync, cursor, hashes } };
}

export interface PushSet {
  upserts: Prayer[];
  deletes: string[];
}

export function pendingPush(data: AppData): PushSet {
  if (!data.sync) return { upserts: [], deletes: [] };
  const { hashes } = data.sync;
  const live = new Set(data.prayers.map((p) => p.id));
  return {
    upserts: data.prayers.filter((p) => hashes[p.id] !== prayerHash(p)),
    deletes: Object.keys(hashes).filter((id) => !live.has(id)),
  };
}

/** Records what the server now has, so it isn't sent again. */
export function markPushed(data: AppData, pushed: Prayer[], deleted: string[]): AppData {
  if (!data.sync) return data;
  const hashes = { ...data.sync.hashes };
  for (const p of pushed) hashes[p.id] = prayerHash(p);
  for (const id of deleted) delete hashes[id];
  return { ...data, sync: { ...data.sync, hashes } };
}
