import { useState, type FormEvent } from 'react';
import { useAccount } from '../sync/AccountProvider';

/** Email sign-in with a one-time code (no password). The email also has a link for the same device. */
export function SignInForm({ intro }: { intro?: string }) {
  const { sendCode, verifyCode } = useAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch {
      setError("That code didn't work. Check the latest email, or send a new code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-sm">
      {intro && <p>{intro}</p>}
      {step === 'email' ? (
        <form className="stack-sm" onSubmit={submitEmail}>
          <label className="field">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
          <p className="muted">No password needed. New here? This creates your free account.</p>
        </form>
      ) : (
        <form className="stack-sm" onSubmit={submitCode}>
          <p>
            Check <strong>{email}</strong>. Enter the 6-digit code from the email, or tap its sign-in link on this device.
          </p>
          <label className="field">
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <div className="row wrap">
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="link" onClick={() => setStep('email')}>
              Use a different email
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
