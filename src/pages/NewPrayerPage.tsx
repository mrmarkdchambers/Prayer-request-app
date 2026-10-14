import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { PrayerForm } from '../components/PrayerForm';
import { dayKey, dayToIso } from '../lib/util';

/** New prayer request, or (kind="praise") a new praise report. */
export function NewPrayerPage({ kind = 'request' }: { kind?: 'request' | 'praise' }) {
  const { dispatch, toast } = useStore();
  const navigate = useNavigate();
  const groupId = useSearchParams()[0].get('group');
  const praise = kind === 'praise';
  return (
    <div className="stack narrow">
      <h1>{praise ? 'New praise report' : 'New prayer request'}</h1>
      <PrayerForm
        kind={kind}
        initial={{
          title: '',
          person: '',
          details: '',
          tags: [],
          scripture: '',
          schedule: { kind: 'auto' },
          followUpOn: null,
          groupId,
          praisedOn: dayKey(new Date()),
        }}
        submitLabel={praise ? 'Add praise report' : 'Add prayer'}
        onSubmit={({ praisedOn, ...v }) => {
          dispatch({ type: 'add', input: praise ? { ...v, kind: 'praise', praisedAt: dayToIso(praisedOn ?? dayKey(new Date())) } : v });
          toast(praise ? 'Praise report added' : 'Prayer added');
          navigate(groupId ? `/groups/${groupId}` : praise ? '/praise' : '/prayers');
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
