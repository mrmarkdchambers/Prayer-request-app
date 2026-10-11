import { applyRemote, attachAccount, detachAccount, markPushed, pendingPush, type RemotePrayer } from './sync';
import { reducer } from './reducer';
import { emptyData, type AppData, type Prayer } from './types';
import { createPrayer } from './prayers';
import { normalizeData, toJson } from './exportImport';

const at = (min: number) => new Date(Date.UTC(2026, 9, 11, 12, min)).toISOString();

function remote(p: Prayer, overrides: Partial<RemotePrayer> = {}): RemotePrayer {
  return { ...p, deleted: false, serverUpdatedAt: at(30), ...overrides };
}

function synced(prayers: Prayer[]): AppData {
  const data = attachAccount({ ...emptyData(), prayers }, 'user-1').data;
  return markPushed(data, prayers, []);
}

describe('attaching an account', () => {
  it('keeps signed-out prayers so they upload', () => {
    const local = { ...emptyData(), prayers: [createPrayer({ title: 'A' })] };
    const { data, migrated } = attachAccount(local, 'user-1');
    expect(migrated).toBe(1);
    expect(pendingPush(data).upserts).toHaveLength(1);
  });

  it("clears another account's prayers", () => {
    const other = synced([createPrayer({ title: 'theirs' })]);
    expect(attachAccount(other, 'user-2').data.prayers).toEqual([]);
    expect(attachAccount(other, 'user-1').data).toBe(other);
  });

  it('signing out removes prayers but keeps settings', () => {
    const data = synced([createPrayer({ title: 'A' })]);
    data.settings.sessionSize = 9;
    const out = detachAccount(data);
    expect(out.prayers).toEqual([]);
    expect(out.sync).toBeUndefined();
    expect(out.settings.sessionSize).toBe(9);
  });
});

describe('pushing', () => {
  it('sends only changed prayers and deletes', () => {
    const a = createPrayer({ title: 'A' });
    const b = createPrayer({ title: 'B' });
    let data = synced([a, b]);
    expect(pendingPush(data)).toEqual({ upserts: [], deletes: [] });
    data = reducer(data, { type: 'prayed', id: a.id });
    data = reducer(data, { type: 'delete', id: b.id });
    const push = pendingPush(data);
    expect(push.upserts.map((p) => p.id)).toEqual([a.id]);
    expect(push.deletes).toEqual([b.id]);
    data = markPushed(data, push.upserts, push.deletes);
    expect(pendingPush(data)).toEqual({ upserts: [], deletes: [] });
  });
});

describe('pulling', () => {
  it('adds new prayers from other devices and advances the cursor', () => {
    const data = synced([]);
    const p = createPrayer({ title: 'From phone' });
    const next = applyRemote(data, [remote(p, { serverUpdatedAt: '2026-10-11T12:30:00.123456+00:00' })]);
    expect(next.prayers.map((x) => x.title)).toEqual(['From phone']);
    expect(next.sync?.cursor).toBe('2026-10-11T12:30:00.123456+00:00');
    expect(pendingPush(next).upserts).toEqual([]);
  });

  it('takes remote edits when the local copy is unchanged', () => {
    const p = { ...createPrayer({ title: 'Old' }), updatedAt: at(10) };
    const data = synced([p]);
    // Even an older clock wins if nothing changed here since the last sync.
    const next = applyRemote(data, [remote({ ...p, title: 'New', updatedAt: at(5) })]);
    expect(next.prayers[0].title).toBe('New');
  });

  it('when both sides changed, the most recent change wins', () => {
    const p = { ...createPrayer({ title: 'Base' }), updatedAt: at(0) };
    const data = synced([p]);
    const editedHere = reducer(data, { type: 'edit', id: p.id, patch: { title: 'Here' }, now: new Date(at(20)) });
    expect(applyRemote(editedHere, [remote({ ...p, title: 'There', updatedAt: at(10) })]).prayers[0].title).toBe('Here');
    expect(applyRemote(editedHere, [remote({ ...p, title: 'There', updatedAt: at(25) })]).prayers[0].title).toBe('There');
  });

  it('counts an "I prayed" tap as a change', () => {
    const p = { ...createPrayer({ title: 'A' }), updatedAt: at(0) };
    const data = reducer(synced([p]), { type: 'prayed', id: p.id, now: new Date(at(20)) });
    const next = applyRemote(data, [remote({ ...p, title: 'Edited elsewhere', updatedAt: at(10) })]);
    expect(next.prayers[0].prayedCount).toBe(1);
  });

  it('applies deletes from other devices', () => {
    const p = createPrayer({ title: 'A' });
    const next = applyRemote(synced([p]), [remote(p, { deleted: true })]);
    expect(next.prayers).toEqual([]);
    expect(next.sync?.hashes).toEqual({});
  });

  it("doesn't resurrect a prayer deleted here but not yet uploaded", () => {
    const p = createPrayer({ title: 'A' });
    const data = reducer(synced([p]), { type: 'delete', id: p.id });
    const next = applyRemote(data, [remote(p)]);
    expect(next.prayers).toEqual([]);
    expect(pendingPush(next).deletes).toEqual([p.id]);
  });

  it('does nothing when signed out', () => {
    const data = emptyData();
    expect(applyRemote(data, [remote(createPrayer({ title: 'x' }))])).toBe(data);
  });
});

describe('backups and sync metadata', () => {
  it('keeps sync state across reloads but not in exported backups', () => {
    const p = createPrayer({ title: 'A', groupId: 'g1' });
    const data = synced([p]);
    expect(normalizeData(JSON.parse(JSON.stringify(data))).sync?.userId).toBe('user-1');
    const backup = JSON.parse(toJson(data));
    expect(backup.sync).toBeUndefined();
    expect(backup.prayers[0].groupId).toBeNull();
  });

  it('restoring a backup while signed in keeps the account link', () => {
    const data = synced([]);
    const restored = reducer(data, { type: 'replace', data: { ...emptyData(), prayers: [createPrayer({ title: 'R' })] } });
    expect(restored.sync?.userId).toBe('user-1');
    expect(pendingPush(restored).upserts).toHaveLength(1);
  });
});
