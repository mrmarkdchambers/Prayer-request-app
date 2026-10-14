export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(iso: string | null, date: Date): boolean {
  return iso !== null && dayKey(new Date(iso)) === dayKey(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string, now = new Date()): string {
  const days = Math.floor((dayStart(now) - dayStart(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** How long a prayer waited: "the same day", "after 1 day", "after 12 days". */
export function waitedLabel(fromIso: string, toIso: string): string {
  const d = daysBetween(fromIso, toIso);
  return d <= 0 ? 'the same day' : d === 1 ? 'after 1 day' : `after ${d} days`;
}

/** A calendar day (YYYY-MM-DD) as a timestamp: now if it's today, otherwise midday that day. */
export function dayToIso(day: string, now = new Date()): string {
  return day === dayKey(now) ? now.toISOString() : new Date(`${day}T12:00:00`).toISOString();
}
