import type { Kind, Prayer, PrayerUpdate, Schedule, Status } from '../lib/types';
import { changedAt, type RemotePrayer } from '../lib/sync';
import { normalizeData } from '../lib/exportImport';

export interface PrayerRow {
  id: string;
  owner_id: string;
  group_id: string | null;
  /** Absent on databases from before praise reports; means 'request'. */
  kind?: Kind;
  title: string;
  details: string;
  person: string;
  tags: string[];
  scripture: string;
  status: Status;
  schedule: Schedule;
  created_at: string;
  updated_at: string;
  changed_at: string;
  answered_at: string | null;
  answer_note: string;
  prayed_count: number;
  last_prayed_at: string | null;
  follow_up_on: string | null;
  updates: PrayerUpdate[];
  deleted: boolean;
  server_updated_at?: string;
}

/** Postgres returns "…+00:00" with microseconds; the app stores JS ISO strings. */
function iso(v: string | null): string | null {
  return v === null ? null : new Date(v).toISOString();
}

export function toRow(p: Prayer, ownerId: string): PrayerRow {
  return {
    id: p.id,
    owner_id: ownerId,
    group_id: p.groupId,
    // Only sent for praise reports, so requests still sync with a database that predates them.
    ...(p.kind === 'praise' ? { kind: 'praise' as const } : {}),
    title: p.title,
    details: p.details,
    person: p.person,
    tags: p.tags,
    scripture: p.scripture,
    status: p.status,
    schedule: p.schedule,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    changed_at: changedAt(p),
    answered_at: p.answeredAt,
    answer_note: p.answerNote,
    prayed_count: p.prayedCount,
    last_prayed_at: p.lastPrayedAt,
    follow_up_on: p.followUpOn,
    updates: p.updates,
    deleted: false,
  };
}

/** An emptied row that tells other devices this prayer was deleted. */
export function tombstoneRow(id: string, ownerId: string, now = new Date()): PrayerRow {
  const at = now.toISOString();
  return {
    id,
    owner_id: ownerId,
    group_id: null,
    title: '',
    details: '',
    person: '',
    tags: [],
    scripture: '',
    status: 'archived',
    schedule: { kind: 'auto' },
    created_at: at,
    updated_at: at,
    changed_at: at,
    answered_at: null,
    answer_note: '',
    prayed_count: 0,
    last_prayed_at: null,
    follow_up_on: null,
    updates: [],
    deleted: true,
  };
}

export function fromRow(r: PrayerRow): RemotePrayer {
  // Run through the same validation as imports so a bad row can't break the app.
  const [p] = normalizeData({
    prayers: [
      {
        id: r.id,
        kind: r.kind ?? 'request',
        title: r.title || '(deleted)',
        details: r.details,
        person: r.person,
        tags: r.tags,
        scripture: r.scripture,
        status: r.status,
        schedule: r.schedule,
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
        answeredAt: iso(r.answered_at),
        answerNote: r.answer_note,
        prayedCount: r.prayed_count,
        lastPrayedAt: iso(r.last_prayed_at),
        followUpOn: r.follow_up_on,
        updates: r.updates,
        groupId: r.group_id,
      },
    ],
  }).prayers;
  return { ...p, deleted: r.deleted, serverUpdatedAt: r.server_updated_at ?? new Date().toISOString() };
}
