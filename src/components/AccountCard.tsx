import { useEffect, useState } from 'react';
import { useAccount } from '../sync/AccountProvider';
import { useStore } from '../store';
import { SignInForm } from './SignInForm';
import { Dialog } from './Dialog';
import { missingBackendSettings } from '../sync/client';

function statusText(status: string, lastSynced: Date | null): string {
  switch (status) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return "Offline. Changes are saved here and will sync when you're back online.";
    case 'error':
      return "Couldn't sync just now. We'll keep trying.";
    case 'synced':
      return `Synced${lastSynced ? ` at ${lastSynced.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}.`;
    default:
      return '';
  }
}

export function AccountCard() {
  const account = useAccount();
  const { data } = useStore();
  const [name, setName] = useState(account.displayName ?? '');
  const [editingName, setEditingName] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  // Show the saved name once it loads, but never overwrite what someone is typing.
  useEffect(() => {
    if (!editingName) setName(account.displayName ?? '');
  }, [account.displayName, editingName]);

  if (!account.enabled) {
    // Half-configured: tell whoever is setting it up what's missing, rather than silently hiding accounts.
    if (missingBackendSettings.length === 0) return null;
    return (
      <section className="card stack-sm">
        <h2>Account</h2>
        <p>Accounts aren't switched on yet. This version of the site was built without {missingBackendSettings.join(' and ')}.</p>
        <p className="muted">
          Add it in Netlify under Project configuration → Environment variables (with the Builds scope), then redeploy with Deploys → Trigger deploy.
        </p>
      </section>
    );
  }

  if (!account.userId) {
    return (
      <section className="card stack-sm">
        <h2>Account</h2>
        <SignInForm
          intro={`Sign in to keep your prayers backed up and in sync across your devices, and to pray with a small group.${
            data.prayers.length ? ` The ${data.prayers.length} prayer${data.prayers.length === 1 ? '' : 's'} on this device will be added to your account.` : ''
          }`}
        />
      </section>
    );
  }

  const signOut = async (force = false) => {
    if (await account.signOut(force)) setWarnOpen(false);
    else setWarnOpen(true);
  };

  return (
    <section className="card stack-sm">
      <h2>Account</h2>
      <p>
        Signed in as <strong>{account.email}</strong>
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          account.setDisplayName(name).then(() => setEditingName(false));
        }}
      >
        <label className="field grow">
          Your name in groups
          <input
            value={name}
            maxLength={60}
            onChange={(e) => {
              setEditingName(true);
              setName(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="btn align-end" disabled={!name.trim() || name.trim() === account.displayName}>
          Save
        </button>
      </form>
      <div className="row wrap">
        <span className="muted" aria-live="polite">
          {statusText(account.status, account.lastSynced)}
        </span>
        <button type="button" className="link" onClick={() => account.syncNow()}>
          Sync now
        </button>
      </div>
      <button type="button" className="btn align-start" onClick={() => signOut()}>
        Sign out
      </button>
      <p className="muted">Signing out removes your prayers from this device. They stay safe in your account.</p>
      <Dialog open={warnOpen} onClose={() => setWarnOpen(false)} title="Some changes haven't uploaded">
        <p>You're offline or the server can't be reached, so your latest changes are only on this device. Signing out now would lose them.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => setWarnOpen(false)}>
            Stay signed in
          </button>
          <button type="button" className="btn btn-danger" onClick={() => signOut(true)}>
            Sign out anyway
          </button>
        </div>
      </Dialog>
    </section>
  );
}
