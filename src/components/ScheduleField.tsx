import type { Schedule } from '../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleField({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  return (
    <fieldset className="field">
      <legend>When to pray for this</legend>
      <select
        aria-label="Schedule"
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as Schedule['kind'];
          if (kind === 'weekly') onChange({ kind, days: [new Date().getDay()] });
          else if (kind === 'monthly') onChange({ kind, day: new Date().getDate() });
          else onChange({ kind });
        }}
      >
        <option value="auto">In rotation (comes up when it's been a while)</option>
        <option value="daily">Every day</option>
        <option value="weekly">On certain weekdays</option>
        <option value="monthly">Once a month</option>
      </select>
      {value.kind === 'weekly' && (
        <div className="chips" role="group" aria-label="Weekdays">
          {DAYS.map((d, i) => {
            const on = value.days.includes(i);
            return (
              <button
                type="button"
                key={d}
                className={`chip ${on ? 'chip-on' : 'chip-ghost'}`}
                aria-pressed={on}
                onClick={() => onChange({ kind: 'weekly', days: on ? value.days.filter((x) => x !== i) : [...value.days, i] })}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {value.kind === 'monthly' && (
        <label className="inline">
          Day of month
          <input type="number" min={1} max={31} value={value.day} onChange={(e) => onChange({ kind: 'monthly', day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
      )}
    </fieldset>
  );
}
