import type { Prayer } from './types';
import { daysBetween } from './util';

export interface Stats {
  active: number;
  /** Prayer requests marked answered. */
  answered: number;
  praiseReports: number;
  /** Answered prayers and praise reports this calendar year. */
  praiseThisYear: number;
  totalPrayers: number;
  averageDaysToAnswer: number | null;
}

/** Everything in the Praise timeline: answered prayers and praise reports. */
function praiseItems(prayers: Prayer[]): Prayer[] {
  return prayers.filter((p) => p.status === 'answered' && p.answeredAt);
}

export function computeStats(prayers: Prayer[], now = new Date()): Stats {
  const items = praiseItems(prayers);
  const answered = items.filter((p) => p.kind === 'request');
  const year = String(now.getFullYear());
  const waits = answered.map((p) => daysBetween(p.createdAt, p.answeredAt!));
  return {
    active: prayers.filter((p) => p.status === 'active').length,
    answered: answered.length,
    praiseReports: items.length - answered.length,
    praiseThisYear: items.filter((p) => p.answeredAt!.startsWith(year)).length,
    totalPrayers: prayers.reduce((n, p) => n + p.prayedCount, 0),
    averageDaysToAnswer: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
  };
}

/** The Praise timeline grouped by month ("October 2026"), newest first. */
export function praiseByMonth(prayers: Prayer[]): [string, Prayer[]][] {
  const items = praiseItems(prayers).sort((a, b) => b.answeredAt!.localeCompare(a.answeredAt!));
  const groups = new Map<string, Prayer[]>();
  for (const p of items) {
    const label = new Date(p.answeredAt!).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  return [...groups.entries()];
}
