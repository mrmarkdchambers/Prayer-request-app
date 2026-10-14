import { DEFAULT_SETTINGS, emptyData, type AppData, type Prayer, type Schedule, type Status } from './types';
import { createPrayer } from './prayers';
import { uniqueTags } from './tags';
import { newId } from './util';

/** A portable backup: sync bookkeeping and group sharing are account-specific, so they're left out. */
export function toJson(data: AppData): string {
  const { version, settings } = data;
  return JSON.stringify({ version, settings, prayers: data.prayers.map((p) => ({ ...p, groupId: null })) }, null, 2);
}

const STATUSES: Status[] = ['active', 'answered', 'archived'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normalizeSchedule(v: unknown): Schedule {
  const s = v as Partial<Schedule> | undefined;
  if (s?.kind === 'daily') return { kind: 'daily' };
  if (s?.kind === 'weekly' && Array.isArray((s as { days?: unknown }).days))
    return { kind: 'weekly', days: (s as { days: unknown[] }).days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) };
  if (s?.kind === 'monthly') {
    const day = Number((s as { day?: unknown }).day);
    return { kind: 'monthly', day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1 };
  }
  return { kind: 'auto' };
}

function normalizePrayer(v: unknown): Prayer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const title = str(o.title).trim();
  if (!title) return null;
  const now = new Date().toISOString();
  const status = STATUSES.includes(o.status as Status) ? (o.status as Status) : 'active';
  return {
    id: str(o.id) || newId(),
    title,
    details: str(o.details),
    person: str(o.person),
    tags: Array.isArray(o.tags) ? uniqueTags(o.tags.filter((t): t is string => typeof t === 'string')) : [],
    scripture: str(o.scripture),
    kind: o.kind === 'praise' ? 'praise' : 'request',
    status,
    schedule: normalizeSchedule(o.schedule),
    createdAt: str(o.createdAt, now),
    updatedAt: str(o.updatedAt, now),
    answeredAt: typeof o.answeredAt === 'string' ? o.answeredAt : null,
    answerNote: str(o.answerNote),
    prayedCount: typeof o.prayedCount === 'number' && o.prayedCount >= 0 ? Math.floor(o.prayedCount) : 0,
    lastPrayedAt: typeof o.lastPrayedAt === 'string' ? o.lastPrayedAt : null,
    followUpOn: typeof o.followUpOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.followUpOn) ? o.followUpOn : null,
    updates: Array.isArray(o.updates)
      ? o.updates
          .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object')
          .map((u) => ({
            id: str(u.id) || newId(),
            at: str(u.at, now),
            kind: (['note', 'answered', 'reopened', 'archived'] as const).find((k) => k === u.kind) ?? 'note',
            text: str(u.text),
          }))
      : [],
    groupId: typeof o.groupId === 'string' ? o.groupId : null,
  };
}

function normalizeSync(v: unknown): AppData['sync'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.userId !== 'string') return undefined;
  const hashes: Record<string, string> = {};
  if (o.hashes && typeof o.hashes === 'object') {
    for (const [k, h] of Object.entries(o.hashes as Record<string, unknown>)) if (typeof h === 'string') hashes[k] = h;
  }
  return { userId: o.userId, cursor: typeof o.cursor === 'string' ? o.cursor : null, hashes };
}

/** Accepts anything parsed from JSON and returns valid app data, dropping what it can't use. */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const o = raw as Record<string, unknown>;
  const prayers = Array.isArray(o.prayers) ? o.prayers.map(normalizePrayer).filter((p): p is Prayer => p !== null) : [];
  const s = (o.settings ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    prayers,
    settings: {
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
      sessionSize:
        typeof s.sessionSize === 'number' && s.sessionSize >= 1 && s.sessionSize <= 50
          ? Math.floor(s.sessionSize)
          : DEFAULT_SETTINGS.sessionSize,
      reminderTime: typeof s.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(s.reminderTime) ? s.reminderTime : DEFAULT_SETTINGS.reminderTime,
      supportPromptDismissed: s.supportPromptDismissed === true,
    },
    ...(normalizeSync(o.sync) ? { sync: normalizeSync(o.sync) } : {}),
  };
}

/** Merges imported prayers into existing data; on matching ids the most recently updated copy wins. */
export function mergeData(current: AppData, incoming: AppData): { data: AppData; added: number; updated: number } {
  const byId = new Map(current.prayers.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  for (const p of incoming.prayers) {
    const existing = byId.get(p.id);
    if (!existing) {
      byId.set(p.id, p);
      added++;
    } else if (p.updatedAt > existing.updatedAt) {
      byId.set(p.id, p);
      updated++;
    }
  }
  return { data: { ...current, prayers: [...byId.values()] }, added, updated };
}

// ---------- CSV ----------

const CSV_COLUMNS = ['kind', 'title', 'details', 'person', 'tags', 'scripture', 'status', 'createdAt', 'answeredAt', 'answerNote', 'prayedCount'] as const;

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(prayers: Prayer[]): string {
  const rows = prayers.map((p) =>
    CSV_COLUMNS.map((c) => csvCell(c === 'tags' ? p.tags.join(' ') : (p[c] as string | number | null))).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Reads prayers from a CSV with a header row. Only a "title" (or "request"/"prayer") column is required. */
export function prayersFromCsv(text: string): Prayer[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const cols = header.map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const titleIdx = idx('title', 'request', 'prayer', 'prayer request');
  if (titleIdx < 0) throw new Error('The CSV needs a "title" column.');
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const c = {
    details: idx('details', 'description', 'notes'),
    person: idx('person', 'name', 'for'),
    tags: idx('tags', 'tag', 'category', 'categories'),
    scripture: idx('scripture', 'verse'),
    status: idx('status'),
    createdAt: idx('createdat', 'created', 'date'),
    answeredAt: idx('answeredat', 'answered'),
    answerNote: idx('answernote', 'answer'),
    prayedCount: idx('prayedcount'),
    kind: idx('kind', 'type'),
  };
  const out: Prayer[] = [];
  for (const r of rows) {
    const title = get(r, titleIdx);
    if (!title) continue;
    const kind = /^praise/i.test(get(r, c.kind)) ? 'praise' : 'request';
    const p = createPrayer({
      kind,
      title,
      details: get(r, c.details),
      person: get(r, c.person),
      tags: get(r, c.tags).split(/[\s,;]+/),
      scripture: get(r, c.scripture),
    });
    const status = get(r, c.status).toLowerCase() as Status;
    if (STATUSES.includes(status)) p.status = status;
    const created = Date.parse(get(r, c.createdAt));
    if (!Number.isNaN(created)) p.createdAt = p.updatedAt = new Date(created).toISOString();
    const answered = Date.parse(get(r, c.answeredAt));
    if (!Number.isNaN(answered)) p.answeredAt = new Date(answered).toISOString();
    if (p.status === 'answered' && !p.answeredAt) p.answeredAt = p.updatedAt;
    p.answerNote = get(r, c.answerNote);
    const count = Number(get(r, c.prayedCount));
    if (Number.isInteger(count) && count > 0) p.prayedCount = count;
    out.push(p);
  }
  return out;
}

// ---------- Calendar reminder ----------

/** A daily recurring calendar event, so reminders work even when the app is closed. */
export function dailyReminderIcs(time: string, appUrl: string, appName = 'Prayer app', now = new Date()): string {
  const [hh, mm] = time.split(':');
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${appName}//EN`,
    'BEGIN:VEVENT',
    `UID:prayer-reminder-${ymd}@prayer-list`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${hh}${mm}00`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Time to pray',
    `DESCRIPTION:Open ${appName}: ${appUrl}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to pray',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
