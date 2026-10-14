export type Status = 'active' | 'answered' | 'archived';

/**
 * A prayer request, or a praise report (something to give thanks for).
 * Praise reports are stored with status 'answered' and answeredAt set to the
 * day of the praise, so they sit in the Praise timeline beside answered prayers
 * and never come up in the daily prayer session.
 */
export type Kind = 'request' | 'praise';

/**
 * When a prayer comes up in the daily session.
 * - auto: rotates in when it's been the longest since you prayed for it
 * - daily: every day
 * - weekly: on the given weekdays (0 = Sunday)
 * - monthly: on the given day of the month (clamped to the month's last day)
 */
export type Schedule =
  | { kind: 'auto' }
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'monthly'; day: number };

export type UpdateKind = 'note' | 'answered' | 'reopened' | 'archived';

export interface PrayerUpdate {
  id: string;
  at: string; // ISO timestamp
  kind: UpdateKind;
  text: string;
}

export interface Prayer {
  id: string;
  title: string;
  details: string;
  person: string;
  tags: string[];
  scripture: string;
  kind: Kind;
  status: Status;
  schedule: Schedule;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
  answerNote: string;
  prayedCount: number;
  lastPrayedAt: string | null;
  followUpOn: string | null; // YYYY-MM-DD
  updates: PrayerUpdate[];
  groupId: string | null; // shared with this group; null = private
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  sessionSize: number;
  reminderTime: string; // HH:MM
  supportPromptDismissed: boolean;
}

/** Bookkeeping for syncing with the signed-in account. Absent when signed out. */
export interface SyncState {
  userId: string;
  /** Server timestamp of the newest change pulled so far. */
  cursor: string | null;
  /** Content hash of each prayer as last agreed with the server. */
  hashes: Record<string, string>;
}

export interface AppData {
  version: 1;
  prayers: Prayer[];
  settings: Settings;
  sync?: SyncState;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  sessionSize: 5,
  reminderTime: '07:30',
  supportPromptDismissed: false,
};

export function emptyData(): AppData {
  return { version: 1, prayers: [], settings: { ...DEFAULT_SETTINGS } };
}
