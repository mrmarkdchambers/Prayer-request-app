export type Status = 'active' | 'answered' | 'archived';

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
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  sessionSize: number;
  reminderTime: string; // HH:MM
  supportPromptDismissed: boolean;
}

export interface AppData {
  version: 1;
  prayers: Prayer[];
  settings: Settings;
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
