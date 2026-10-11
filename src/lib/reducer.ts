import type { AppData, Prayer, Settings } from './types';
import { createPrayer, makeUpdate, type NewPrayerInput } from './prayers';

export type Action =
  | { type: 'add'; input: NewPrayerInput; now?: Date }
  | { type: 'addMany'; inputs: NewPrayerInput[]; now?: Date }
  | { type: 'edit'; id: string; patch: Partial<Omit<Prayer, 'id' | 'updates' | 'createdAt'>>; now?: Date }
  | { type: 'delete'; id: string }
  | { type: 'prayed'; id: string; now?: Date }
  | { type: 'answered'; id: string; note: string; now?: Date }
  | { type: 'reopen'; id: string; now?: Date }
  | { type: 'archive'; id: string; now?: Date }
  | { type: 'addUpdate'; id: string; text: string; now?: Date }
  | { type: 'deleteUpdate'; id: string; updateId: string; now?: Date }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData };

function patchPrayer(data: AppData, id: string, now: Date, fn: (p: Prayer) => Prayer): AppData {
  return {
    ...data,
    prayers: data.prayers.map((p) => (p.id === id ? { ...fn(p), updatedAt: now.toISOString() } : p)),
  };
}

export function reducer(data: AppData, action: Action): AppData {
  const now = ('now' in action && action.now) || new Date();
  switch (action.type) {
    case 'add':
      return { ...data, prayers: [createPrayer(action.input, now), ...data.prayers] };
    case 'addMany':
      return { ...data, prayers: [...action.inputs.map((i) => createPrayer(i, now)), ...data.prayers] };
    case 'edit':
      return patchPrayer(data, action.id, now, (p) => ({ ...p, ...action.patch }));
    case 'delete':
      return { ...data, prayers: data.prayers.filter((p) => p.id !== action.id) };
    case 'prayed':
      return {
        ...data,
        // Praying doesn't bump updatedAt, so the list order stays stable.
        prayers: data.prayers.map((p) =>
          p.id === action.id ? { ...p, prayedCount: p.prayedCount + 1, lastPrayedAt: now.toISOString() } : p,
        ),
      };
    case 'answered':
      return patchPrayer(data, action.id, now, (p) => ({
        ...p,
        status: 'answered',
        answeredAt: now.toISOString(),
        answerNote: action.note.trim(),
        followUpOn: null,
        updates: [...p.updates, makeUpdate('answered', action.note || 'Marked as answered', now)],
      }));
    case 'reopen':
      return patchPrayer(data, action.id, now, (p) => ({
        ...p,
        status: 'active',
        answeredAt: null,
        answerNote: '',
        updates: [...p.updates, makeUpdate('reopened', 'Moved back to active', now)],
      }));
    case 'archive':
      return patchPrayer(data, action.id, now, (p) => ({
        ...p,
        status: 'archived',
        followUpOn: null,
        updates: [...p.updates, makeUpdate('archived', 'Archived', now)],
      }));
    case 'addUpdate':
      if (!action.text.trim()) return data;
      return patchPrayer(data, action.id, now, (p) => ({
        ...p,
        updates: [...p.updates, makeUpdate('note', action.text, now)],
      }));
    case 'deleteUpdate':
      return patchPrayer(data, action.id, now, (p) => ({
        ...p,
        updates: p.updates.filter((u) => u.id !== action.updateId),
      }));
    case 'settings':
      return { ...data, settings: { ...data.settings, ...action.patch } };
    case 'replace':
      return action.data;
  }
}
