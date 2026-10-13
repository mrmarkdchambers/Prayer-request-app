import { useEffect, useState } from 'react';
import { useAccount } from '../sync/AccountProvider';
import { useStore } from '../store';
import { supabase } from '../sync/client';
import * as api from '../sync/api';
import { disablePush, enablePush, isPushEnabled, pushSupport } from '../sync/push';

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Settings → Notifications, for signed-in people. */
export function NotificationsCard() {
  const { userId } = useAccount();
  const { data, dispatch, toast } = useStore();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<api.NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = pushSupport();

  useEffect(() => {
    if (!supabase || !userId) return;
    isPushEnabled().then(setEnabled, () => setEnabled(false));
    api.getNotificationSettings(supabase, userId).then(
      (s) => setPrefs(s ?? { ...api.DEFAULT_NOTIFICATION_SETTINGS, reminderTime: data.settings.reminderTime, timezone: localTimezone() }),
      () => setPrefs(null),
    );
    // Only on sign-in; the reminder time is read once as a starting value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!supabase || !userId) return null;

  const save = async (next: api.NotificationSettings) => {
    const previous = prefs;
    setPrefs(next);
    try {
      // Reminders follow wherever you are now.
      await api.saveNotificationSettings(supabase!, userId, { ...next, timezone: localTimezone() });
      if (next.reminderTime !== data.settings.reminderTime) dispatch({ type: 'settings', patch: { reminderTime: next.reminderTime } });
    } catch {
      setPrefs(previous);
      toast("Couldn't save that. Check your connection.");
    }
  };

  const toggleDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await disablePush(supabase);
        setEnabled(false);
      } else {
        await enablePush(supabase!);
        setEnabled(true);
        // Save settings on first use so reminders know this person's time zone.
        if (prefs) await save(prefs);
        toast('Notifications are on');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack-sm">
      <h2>Notifications</h2>
      {support === 'unsupported' && <p className="muted">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari, or the app.</p>}
      {support === 'needs-home-screen' && (
        <p className="muted">
          On iPhone and iPad, notifications work once this site is on your Home Screen: tap the Share button, then "Add to Home Screen", and open
          it from there.
        </p>
      )}
      {support === 'supported' && (
        <div className="row wrap">
          <button type="button" className={`btn ${enabled ? '' : 'btn-primary'}`} onClick={toggleDevice} disabled={busy || enabled === null}>
            {busy ? 'One moment…' : enabled ? 'Turn off on this device' : 'Turn on notifications on this device'}
          </button>
          {enabled && <span className="muted">On for this device.</span>}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {prefs && (
        <fieldset className="field prefs" disabled={busy}>
          <legend>Notify me when</legend>
          <label className="check">
            <input type="checkbox" checked={prefs.prayedForMe} onChange={(e) => save({ ...prefs, prayedForMe: e.target.checked })} />
            Someone prays for my request
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.groupActivity} onChange={(e) => save({ ...prefs, groupActivity: e.target.checked })} />
            A group I'm in shares a new request or an answered prayer
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.dailyReminder} onChange={(e) => save({ ...prefs, dailyReminder: e.target.checked })} />
            It's time for my daily prayers, at
            <input
              type="time"
              aria-label="Daily reminder time"
              value={prefs.reminderTime}
              onChange={(e) => e.target.value && save({ ...prefs, reminderTime: e.target.value, dailyReminder: true })}
            />
          </label>
        </fieldset>
      )}
      <p className="muted">Notifications go to every device where you've turned them on. Each device can be turned off separately.</p>
    </section>
  );
}
