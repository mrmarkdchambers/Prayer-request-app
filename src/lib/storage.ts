import { emptyData, type AppData } from './types';
import { normalizeData } from './exportImport';

/**
 * Where app data lives. v1 keeps everything in this browser; a synced
 * backend (e.g. Supabase for accounts and groups) can implement the same
 * interface later without touching the UI.
 */
export interface Repository {
  load(): AppData;
  save(data: AppData): void;
}

const KEY = 'prayer-list:v1';

export const localRepository: Repository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalizeData(JSON.parse(raw)) : emptyData();
    } catch {
      return emptyData();
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked (private mode); the app keeps working in memory.
    }
  },
};
