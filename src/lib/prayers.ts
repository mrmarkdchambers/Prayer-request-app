import type { Prayer, Schedule, PrayerUpdate, UpdateKind } from './types';
import { newId } from './util';
import { uniqueTags } from './tags';

export interface NewPrayerInput {
  title: string;
  details?: string;
  person?: string;
  tags?: string[];
  scripture?: string;
  schedule?: Schedule;
  followUpOn?: string | null;
}

export function createPrayer(input: NewPrayerInput, now = new Date()): Prayer {
  const at = now.toISOString();
  return {
    id: newId(),
    title: input.title.trim(),
    details: input.details?.trim() ?? '',
    person: input.person?.trim() ?? '',
    tags: uniqueTags(input.tags ?? []),
    scripture: input.scripture?.trim() ?? '',
    status: 'active',
    schedule: input.schedule ?? { kind: 'auto' },
    createdAt: at,
    updatedAt: at,
    answeredAt: null,
    answerNote: '',
    prayedCount: 0,
    lastPrayedAt: null,
    followUpOn: input.followUpOn ?? null,
    updates: [],
  };
}

export function makeUpdate(kind: UpdateKind, text: string, now = new Date()): PrayerUpdate {
  return { id: newId(), at: now.toISOString(), kind, text: text.trim() };
}

export function scheduleLabel(s: Schedule): string {
  switch (s.kind) {
    case 'auto':
      return 'In rotation';
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return s.days.length ? `Every ${[...s.days].sort().map((d) => names[d]).join(', ')}` : 'Weekly (no days set)';
    }
    case 'monthly':
      return `Monthly on day ${s.day}`;
  }
}

export interface PrayerFilter {
  query: string;
  status: Prayer['status'] | 'all';
  tag: string | null;
  person: string | null;
}

export function filterPrayers(prayers: Prayer[], f: PrayerFilter): Prayer[] {
  const q = f.query.trim().toLowerCase();
  return prayers.filter((p) => {
    if (f.status !== 'all' && p.status !== f.status) return false;
    if (f.tag && !p.tags.includes(f.tag)) return false;
    if (f.person && p.person.toLowerCase() !== f.person.toLowerCase()) return false;
    if (!q) return true;
    const haystack = [p.title, p.details, p.person, p.scripture, p.answerNote, ...p.tags, ...p.updates.map((u) => u.text)]
      .join(' ')
      .toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word.replace(/^#/, '')));
  });
}

export function sortPrayers(prayers: Prayer[]): Prayer[] {
  return [...prayers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
