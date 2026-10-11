import { useCallback, useEffect, useState } from 'react';
import { supabase } from './client';
import * as api from './api';

/** Loads a group's shared requests and keeps them fresh while the page is open. */
/** `refreshKey` changing (e.g. after a sync uploads your edits) triggers a reload. */
export function useGroupPrayers(groupId: string | undefined, enabled: boolean, refreshKey?: unknown) {
  const [prayers, setPrayers] = useState<api.SharedPrayer[] | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !groupId || !enabled) return;
    try {
      setPrayers(await api.groupPrayers(supabase, groupId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [groupId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    const id = window.setInterval(refresh, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  return { prayers, error, refresh, setPrayers };
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

const PENDING_JOIN = 'prayer-list:pending-join';

/** Remembers an invite across the sign-in email round trip. */
export const pendingJoin = {
  get(): string | null {
    try {
      return localStorage.getItem(PENDING_JOIN);
    } catch {
      return null;
    }
  },
  set(code: string | null) {
    try {
      if (code) localStorage.setItem(PENDING_JOIN, code);
      else localStorage.removeItem(PENDING_JOIN);
    } catch {
      /* storage blocked */
    }
  },
};
