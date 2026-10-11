import { useState, type FormEvent } from 'react';
import { useAccount } from '../sync/AccountProvider';

/** Asks for a display name the first time someone uses groups, so members know who's praying. */
export function NamePrompt() {
  const { displayName, setDisplayName } = useAccount();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  if (displayName !== '') return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await setDisplayName(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card name-prompt stack-sm">
      <h2>What should your group call you?</h2>
      <p className="muted">Group members see this name next to your requests and prayers. They never see your email address.</p>
      <form className="row" onSubmit={save}>
        <label htmlFor="display-name" className="sr-only">
          Your name
        </label>
        <input id="display-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah J." autoComplete="name" />
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          Save
        </button>
      </form>
    </section>
  );
}
