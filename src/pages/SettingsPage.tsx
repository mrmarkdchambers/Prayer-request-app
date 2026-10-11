import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { dailyReminderIcs, mergeData, normalizeData, prayersFromCsv, toCsv, toJson } from '../lib/exportImport';
import { download } from '../lib/download';
import { dayKey } from '../lib/util';
import { emptyData, type Theme } from '../lib/types';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { AccountCard } from '../components/AccountCard';
import { useAccount } from '../sync/AccountProvider';

export function SettingsPage() {
  const { data, dispatch, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const s = data.settings;
  const account = useAccount();
  const stamp = dayKey(new Date());

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const incoming = file.name.toLowerCase().endsWith('.csv')
        ? { ...emptyData(), prayers: prayersFromCsv(text) }
        : normalizeData(JSON.parse(text));
      const { data: merged, added, updated } = mergeData(data, incoming);
      dispatch({ type: 'replace', data: merged });
      toast(`Imported: ${added} new, ${updated} updated`);
    } catch (e) {
      toast(e instanceof Error && e.message.includes('title') ? e.message : "Couldn't read that file");
    }
  };

  return (
    <div className="stack narrow">
      <h1>Settings</h1>
      <AccountCard />

      <section className="card stack-sm">
        <h2>Appearance</h2>
        <div className="tabs" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" className="tab" aria-pressed={s.theme === t} onClick={() => dispatch({ type: 'settings', patch: { theme: t } })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack-sm">
        <h2>Daily prayer</h2>
        <label className="inline">
          Requests per session
          <input
            type="number"
            min={1}
            max={50}
            value={s.sessionSize}
            onChange={(e) => dispatch({ type: 'settings', patch: { sessionSize: Math.min(50, Math.max(1, Number(e.target.value) || 1)) } })}
          />
        </label>
        <p className="muted">Prayers set to a fixed day are always included; the rest rotate so everything gets prayed for.</p>
        <label className="inline">
          Reminder time
          <input type="time" value={s.reminderTime} onChange={(e) => e.target.value && dispatch({ type: 'settings', patch: { reminderTime: e.target.value } })} />
        </label>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => download('prayer-reminder.ics', dailyReminderIcs(s.reminderTime, location.origin + location.pathname), 'text/calendar')}>
            <Icon name="calendar" /> Add daily reminder to my calendar
          </button>
          {permission === 'default' && (
            <button type="button" className="btn" onClick={async () => setPermission(await Notification.requestPermission())}>
              Allow notifications
            </button>
          )}
        </div>
        <p className="muted">
          The calendar reminder works even when this app is closed.
          {permission === 'granted' && ' Notifications are on while the app is open.'}
          {permission === 'denied' && ' Notifications are blocked in your browser settings.'}
        </p>
      </section>

      <section className="card stack-sm">
        <h2>Your data</h2>
        <p className="muted">
          {account.userId
            ? 'Your prayers are saved to your account and kept on this device for offline use. You can also download your own copy at any time.'
            : 'Your prayers are stored only in this browser. Export a backup now and then, especially before clearing browser data or switching devices.'}
        </p>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => download(`prayer-list-backup-${stamp}.json`, toJson(data), 'application/json')}>
            Back up (JSON)
          </button>
          <button type="button" className="btn" onClick={() => download(`prayer-list-${stamp}.csv`, toCsv(data.prayers), 'text/csv')}>
            Export spreadsheet (CSV)
          </button>
          <Link to="/print" className="btn">
            Print or save as PDF
          </Link>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="muted">Import accepts a backup from this app, or a CSV from another app with a "title" column. Nothing is overwritten except older copies of the same prayers.</p>
        {!account.userId && (
          <button type="button" className="btn btn-danger-ghost" onClick={() => setClearOpen(true)}>
            <Icon name="trash" /> Delete all data
          </button>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Support Prayer List</h2>
        <p>Every feature is free, with no ads and no tracking. If it helps you pray, you can chip in to keep it running.</p>
        <Link to="/support" className="btn">
          <Icon name="heart" /> Support
        </Link>
      </section>

      <section className="card stack-sm">
        <h2>Privacy</h2>
        <p className="muted">
          No ads, no analytics, no tracking, and your data is never sold or shared. Without an account, your prayers never leave this device. With
          one, they're stored securely so only you can see them. A request is shared only if you choose a group for it, and then only with that
          group's members. Members see the name you choose, never your email.
        </p>
      </section>

      <Dialog open={clearOpen} onClose={() => setClearOpen(false)} title="Delete all data?">
        <p>This permanently removes every prayer and setting from this browser. Back up first if you might want them later.</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              dispatch({ type: 'replace', data: emptyData() });
              setClearOpen(false);
              toast('All data deleted');
            }}
          >
            Delete everything
          </button>
          <button type="button" className="btn" onClick={() => setClearOpen(false)}>
            Cancel
          </button>
        </div>
      </Dialog>
    </div>
  );
}
