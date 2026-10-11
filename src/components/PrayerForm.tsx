import { useState, type FormEvent } from 'react';
import type { Schedule } from '../lib/types';
import { TagInput } from './TagInput';
import { ScheduleField } from './ScheduleField';
import { PeopleList } from './PeopleList';

export interface PrayerFormValues {
  title: string;
  person: string;
  details: string;
  tags: string[];
  scripture: string;
  schedule: Schedule;
  followUpOn: string | null;
}

export function PrayerForm({ initial, submitLabel, onSubmit, onCancel }: { initial: PrayerFormValues; submitLabel: string; onSubmit: (v: PrayerFormValues) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof PrayerFormValues>(k: K, val: PrayerFormValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return;
    onSubmit(v);
  };

  return (
    <form className="form" onSubmit={submit}>
      <PeopleList />
      <label className="field">
        What are you praying for?
        <input required value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Healing after surgery" autoFocus />
      </label>
      <label className="field">
        For whom <span className="muted">(optional)</span>
        <input value={v.person} onChange={(e) => set('person', e.target.value)} placeholder="Sarah" list="people" />
      </label>
      <label className="field">
        Details <span className="muted">(optional)</span>
        <textarea rows={4} value={v.details} onChange={(e) => set('details', e.target.value)} />
      </label>
      <TagInput value={v.tags} onChange={(t) => set('tags', t)} />
      <label className="field">
        Scripture <span className="muted">(optional)</span>
        <input value={v.scripture} onChange={(e) => set('scripture', e.target.value)} placeholder="Philippians 4:6–7" />
      </label>
      <ScheduleField value={v.schedule} onChange={(s) => set('schedule', s)} />
      <label className="field">
        Follow up on <span className="muted">(optional, e.g. check in after the appointment)</span>
        <input type="date" value={v.followUpOn ?? ''} onChange={(e) => set('followUpOn', e.target.value || null)} />
      </label>
      <div className="row">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
