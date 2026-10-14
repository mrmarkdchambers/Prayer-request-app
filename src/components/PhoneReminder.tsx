import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { clearPhoneReminder, isPhoneReminderOn, setPhoneReminder } from '../native';

/** In the apps: a daily reminder the phone schedules itself (works offline, no account needed). */
export function PhoneReminder() {
  const { data, dispatch, toast } = useStore();
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const time = data.settings.reminderTime;

  useEffect(() => {
    isPhoneReminderOn().then(setOn, () => setOn(false));
  }, []);

  const apply = async (enable: boolean, at: string) => {
    setError(null);
    try {
      if (enable) await setPhoneReminder(at);
      else await clearPhoneReminder();
      setOn(enable);
      if (enable) toast(`Reminder set for ${at} every day`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set the reminder");
      setOn(false);
    }
  };

  return (
    <div className="stack-sm">
      <label className="check">
        <input type="checkbox" checked={!!on} disabled={on === null} onChange={(e) => apply(e.target.checked, time)} />
        Remind me every day at
        <input
          type="time"
          aria-label="Daily reminder time"
          value={time}
          onChange={(e) => {
            const t = e.target.value;
            if (!t) return;
            dispatch({ type: 'settings', patch: { reminderTime: t } });
            if (on) apply(true, t);
          }}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
