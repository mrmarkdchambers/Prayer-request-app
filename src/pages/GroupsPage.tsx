import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../sync/AccountProvider';
import { supabase } from '../sync/client';
import * as api from '../sync/api';
import { SignInForm } from '../components/SignInForm';
import { Icon } from '../components/Icon';
import { NamePrompt } from '../components/NamePrompt';

/** Accepts a full invite link or just the code. */
function extractCode(input: string): string {
  const m = /join\/([A-Za-z0-9_-]+)/.exec(input);
  return (m ? m[1] : input).trim();
}

export function GroupsPage() {
  const account = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refreshGroups } = account;
  useEffect(() => {
    refreshGroups();
  }, [refreshGroups]);

  if (!account.enabled) return <p>Groups aren't available in this version.</p>;
  if (!account.userId) {
    return (
      <div className="stack narrow">
        <h1>Groups</h1>
        <section className="card">
          <SignInForm intro="Pray together with your small group, family, or friends. Sign in to create or join a group." />
        </section>
      </div>
    );
  }

  const act = async (e: FormEvent, fn: () => Promise<string>) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const id = await fn();
      await account.refreshGroups();
      navigate(`/groups/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack narrow">
      <h1>Groups</h1>
      <p className="muted">Share requests with people you trust and see when they pray for you. Only members can see a group's requests.</p>
      <NamePrompt />

      {account.groups === null ? (
        <p className="muted">Loading…</p>
      ) : account.groups.length === 0 ? (
        <p className="empty">You're not in any groups yet.</p>
      ) : (
        <ul className="list-plain stack-sm">
          {account.groups.map((g) => (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="card group-link">
                <strong>{g.name}</strong>
                <span className="muted">
                  {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card stack-sm">
        <h2>Start a group</h2>
        <form className="row" onSubmit={(e) => act(e, () => api.createGroup(supabase!, name))}>
          <label htmlFor="group-name" className="sr-only">
            Group name
          </label>
          <input id="group-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday small group" />
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            <Icon name="plus" /> Create
          </button>
        </form>
      </section>

      <section className="card stack-sm">
        <h2>Join a group</h2>
        <form className="row" onSubmit={(e) => act(e, () => api.joinGroup(supabase!, extractCode(code)))}>
          <label htmlFor="join-code" className="sr-only">
            Invite link or code
          </label>
          <input id="join-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste an invite link or code" />
          <button type="submit" className="btn" disabled={busy || !code.trim()}>
            Join
          </button>
        </form>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
