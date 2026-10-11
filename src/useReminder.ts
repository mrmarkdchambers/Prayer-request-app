import { useEffect } from 'react';
import { useStore } from './store';
import { buildSession } from './lib/session';
import { dayKey } from './lib/util';

const KEY = 'prayer-list:last-reminder';

/**
 * While the app is open (or installed and running), shows one notification a
 * day at the reminder time if there are prayers waiting. For reminders when the
 * app is closed, Settings offers a calendar event; true push arrives with sync.
 */
export function useReminder() {
  const { data } = useStore();
  useEffect(() => {
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = new Date();
      const [h, m] = data.settings.reminderTime.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
      let last: string | null = null;
      try {
        last = localStorage.getItem(KEY);
      } catch {
        /* storage blocked */
      }
      if (last === dayKey(now)) return;
      const waiting = buildSession(data.prayers, now, data.settings.sessionSize).length;
      if (!waiting) return;
      try {
        localStorage.setItem(KEY, dayKey(now));
      } catch {
        /* storage blocked */
      }
      new Notification('Time to pray', { body: `${waiting} prayer${waiting === 1 ? '' : 's'} ready for today.`, icon: '/icon.svg' });
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [data.prayers, data.settings.reminderTime, data.settings.sessionSize]);
}
