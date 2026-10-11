import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { PrayerForm } from '../components/PrayerForm';

export function NewPrayerPage() {
  const { dispatch, toast } = useStore();
  const navigate = useNavigate();
  const groupId = useSearchParams()[0].get('group');
  return (
    <div className="stack narrow">
      <h1>New prayer request</h1>
      <PrayerForm
        initial={{ title: '', person: '', details: '', tags: [], scripture: '', schedule: { kind: 'auto' }, followUpOn: null, groupId }}
        submitLabel="Add prayer"
        onSubmit={(v) => {
          dispatch({ type: 'add', input: v });
          toast('Prayer added');
          navigate(groupId ? `/groups/${groupId}` : '/prayers');
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
