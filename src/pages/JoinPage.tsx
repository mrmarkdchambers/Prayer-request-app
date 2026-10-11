import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccount } from '../sync/AccountProvider';
import { supabase } from '../sync/client';
import * as api from '../sync/api';
import { pendingJoin } from '../sync/useGroup';
import { SignInForm } from '../components/SignInForm';

export function JoinPage() {
  const { code = '' } = useParams();
  const account = useAccount();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);
  const { userId, refreshGroups } = account;

  useEffect(() => {
    if (!userId) {
      // If they sign in via the email link, the app reopens at the home page; finish joining there.
      pendingJoin.set(code);
      return;
    }
    if (tried.current || !supabase) return;
    tried.current = true;
    pendingJoin.set(null);
    api.joinGroup(supabase, code).then(
      async (id) => {
        await refreshGroups();
        navigate(`/groups/${id}`, { replace: true });
      },
      (err) => setError(err instanceof Error ? err.message : 'Could not join the group'),
    );
  }, [userId, code, navigate, refreshGroups]);

  if (!account.enabled) return <p>Groups aren't available in this version.</p>;

  return (
    <div className="stack narrow">
      <h1>Join a prayer group</h1>
      {error ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <Link to="/groups">Go to your groups</Link>
        </>
      ) : userId ? (
        <p className="muted">Joining…</p>
      ) : (
        <section className="card">
          <SignInForm intro="You've been invited to pray with a group. Sign in or create a free account to join." />
        </section>
      )}
    </div>
  );
}
