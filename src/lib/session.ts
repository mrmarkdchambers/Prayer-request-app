import type { Prayer } from './types';
import { dayKey, isSameDay } from './util';

/** True if a prayer's fixed schedule puts it on today's list. Auto prayers are never "scheduled". */
export function isScheduledFor(p: Prayer, date: Date): boolean {
  const s = p.schedule;
  switch (s.kind) {
    case 'auto':
      return false;
    case 'daily':
      return true;
    case 'weekly':
      return s.days.includes(date.getDay());
    case 'monthly': {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(s.day, lastDay);
    }
  }
}

function staleness(p: Prayer): string {
  // Never-prayed items sort first, then the longest since last prayed, oldest request breaking ties.
  return (p.lastPrayedAt ?? '0000') + p.createdAt;
}

/**
 * Builds today's prayer session, in the spirit of PrayerMate:
 * everything scheduled for today, then fills up to `size` with the
 * least-recently-prayed rotation items, taking turns across categories
 * (first tag) so one busy category doesn't crowd out the rest.
 * Items already prayed today are left out.
 */
export function buildSession(prayers: Prayer[], date: Date, size: number): Prayer[] {
  const active = prayers.filter((p) => p.status === 'active' && !isSameDay(p.lastPrayedAt, date));
  const scheduled = active.filter((p) => isScheduledFor(p, date)).sort((a, b) => staleness(a).localeCompare(staleness(b)));
  const remaining = Math.max(0, size - scheduled.length);

  const groups = new Map<string, Prayer[]>();
  for (const p of active) {
    if (p.schedule.kind !== 'auto') continue;
    const key = p.tags[0] ?? '';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const queues = [...groups.values()].map((g) => g.sort((a, b) => staleness(a).localeCompare(staleness(b))));
  // Visit categories stalest-first so the overall most-neglected item always gets in.
  queues.sort((a, b) => staleness(a[0]).localeCompare(staleness(b[0])));

  const rotation: Prayer[] = [];
  while (rotation.length < remaining && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (rotation.length >= remaining) break;
      const next = q.shift();
      if (next) rotation.push(next);
    }
  }
  return [...scheduled, ...rotation];
}

export function prayedTodayCount(prayers: Prayer[], date: Date): number {
  return prayers.filter((p) => isSameDay(p.lastPrayedAt, date)).length;
}

export function followUpsDue(prayers: Prayer[], date: Date): Prayer[] {
  const today = dayKey(date);
  return prayers
    .filter((p) => p.status === 'active' && p.followUpOn !== null && p.followUpOn <= today)
    .sort((a, b) => (a.followUpOn ?? '').localeCompare(b.followUpOn ?? ''));
}
