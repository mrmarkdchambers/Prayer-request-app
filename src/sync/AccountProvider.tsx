import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';
import * as api from './api';
import { useStore } from '../store';
import { applyRemote, pendingPush } from '../lib/sync';
import { publicUrl } from '../platform';
import { disablePush } from './push';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface Account {
  /** False when no backend is configured; account features are hidden. */
  enabled: boolean;
  ready: boolean;
  userId: string | null;
  email: string | null;
  /** Null while loading; empty if the person hasn't chosen one yet. */
  displayName: string | null;
  setDisplayName: (name: string) => Promise<void>;
  status: SyncStatus;
  lastSynced: Date | null;
  syncNow: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Returns false (and stays signed in) if changes haven't uploaded, unless forced. */
  signOut: (force?: boolean) => Promise<boolean>;
  /** Permanently deletes the account and everything in it, then signs out. */
  deleteAccount: () => Promise<void>;
  groups: api.Group[] | null;
  refreshGroups: () => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { data, dispatch } = useStore();
  const sb = supabase;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!sb);
  const [displayName, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [groups, setGroups] = useState<api.Group[] | null>(null);
  const userId = session?.user.id ?? null;

  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data: s }) => {
      setSession(s.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        dispatch({ type: 'syncDetach' });
        setGroups(null);
        setStatus('idle');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, dispatch]);

  // Link this device's data to the signed-in account (uploading anything made while signed out).
  useEffect(() => {
    if (userId && dataRef.current.sync?.userId !== userId) dispatch({ type: 'syncAttach', userId });
  }, [userId, dispatch]);
  const attached = !!userId && data.sync?.userId === userId;

  const syncNow = useCallback(async () => {
    if (!sb || !userId || dataRef.current.sync?.userId !== userId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      let rounds = 0;
      do {
        again.current = false;
        const rows = await api.pullChanges(sb, userId, dataRef.current.sync?.cursor ?? null);
        dispatch({ type: 'syncApply', rows });
        const toPush = pendingPush(applyRemote(dataRef.current, rows));
        if (toPush.upserts.length || toPush.deletes.length) {
          const res = await api.pushChanges(sb, userId, toPush);
          dispatch({ type: 'syncPushed', pushed: res.pushed, deleted: res.deleted });
          // A request shared with a group you're no longer in goes back to private, then retries.
          const unshare = res.failed.filter((p) => p.groupId);
          for (const p of unshare) dispatch({ type: 'edit', id: p.id, patch: { groupId: null } });
          if (unshare.length) again.current = true;
          if (res.failed.length > unshare.length) throw new Error('Some prayers could not be saved');
        }
      } while (again.current && ++rounds < 3);
      setStatus('synced');
      setLastSynced(new Date());
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      running.current = false;
    }
  }, [sb, userId, dispatch]);

  // Sync when signing in, coming back online, or returning to the app, and every few minutes.
  useEffect(() => {
    if (!attached) return;
    syncNow();
    const onFocus = () => document.visibilityState === 'visible' && syncNow();
    window.addEventListener('online', syncNow);
    document.addEventListener('visibilitychange', onFocus);
    const id = window.setInterval(syncNow, 5 * 60_000);
    return () => {
      window.removeEventListener('online', syncNow);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(id);
    };
  }, [attached, syncNow]);

  // Upload local edits shortly after they happen.
  const hasPending = attached && (() => {
    const p = pendingPush(data);
    return p.upserts.length + p.deletes.length > 0;
  })();
  useEffect(() => {
    if (!hasPending) return;
    const id = window.setTimeout(syncNow, 1500);
    return () => window.clearTimeout(id);
  }, [hasPending, data.prayers, syncNow]);

  const refreshGroups = useCallback(async () => {
    if (!sb || !userId) return;
    try {
      setGroups(await api.listGroups(sb));
    } catch {
      /* offline: keep what we have */
    }
  }, [sb, userId]);

  useEffect(() => {
    if (!sb || !userId) return;
    refreshGroups();
    setName(null);
    api.getDisplayName(sb, userId).then(setName, () => {});
  }, [sb, userId, refreshGroups]);

  const value = useMemo<Account>(
    () => ({
      enabled: !!sb,
      ready,
      userId,
      email: session?.user.email ?? null,
      displayName,
      setDisplayName: async (name) => {
        if (!sb || !userId) return;
        await api.setDisplayName(sb, userId, name);
        setName(name.trim());
        refreshGroups();
      },
      status,
      lastSynced,
      syncNow,
      sendCode: async (email) => {
        if (!sb) return;
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: publicUrl, shouldCreateUser: true },
        });
        if (error) throw error;
      },
      verifyCode: async (email, code) => {
        if (!sb) return;
        const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (error) throw error;
      },
      signOut: async (force = false) => {
        if (!sb) return true;
        await syncNow();
        const left = pendingPush(dataRef.current);
        if (!force && left.upserts.length + left.deletes.length > 0) return false;
        await disablePush(sb);
        await sb.auth.signOut();
        dispatch({ type: 'syncDetach' });
        return true;
      },
      deleteAccount: async () => {
        if (!sb) return;
        await api.deleteAccount(sb);
        await disablePush(null);
        await sb.auth.signOut({ scope: 'local' });
        dispatch({ type: 'syncDetach' });
      },
      groups,
      refreshGroups,
    }),
    [sb, ready, userId, session, displayName, status, lastSynced, syncNow, groups, refreshGroups, dispatch],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const a = useContext(AccountContext);
  if (!a) throw new Error('useAccount must be used inside AccountProvider');
  return a;
}
