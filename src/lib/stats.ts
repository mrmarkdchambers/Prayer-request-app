import type { Prayer } from './types';
import { daysBetween } from './util';

export interface Stats {
  active: number;
  answered: number;
  answeredThisYear: number;
  totalPrayers: number;
  averageDaysToAnswer: number | null;
}

export function computeStats(prayers: Prayer[], now = new Date()): Stats {
  const answered = prayers.filter((p) => p.status === 'answered' && p.answeredAt);
  const year = String(now.getFullYear());
  const waits = answered.map((p) => daysBetween(p.createdAt, p.answeredAt!));
  return {
    active: prayers.filter((p) => p.status === 'active').length,
    answered: answered.length,
    answeredThisYear: answered.filter((p) => p.answeredAt!.startsWith(year)).length,
    totalPrayers: prayers.reduce((n, p) => n + p.prayedCount, 0),
    averageDaysToAnswer: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
  };
}

/** Answered prayers grouped by month ("October 2026"), newest first. */
export function answeredByMonth(prayers: Prayer[]): [string, Prayer[]][] {
  const answered = prayers
    .filter((p) => p.status === 'answered' && p.answeredAt)
    .sort((a, b) => b.answeredAt!.localeCompare(a.answeredAt!));
  const groups = new Map<string, Prayer[]>();
  for (const p of answered) {
    const label = new Date(p.answeredAt!).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  return [...groups.entries()];
}
