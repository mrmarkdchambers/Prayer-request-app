import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { PrayerForm } from '../components/PrayerForm';

export function NewPrayerPage() {
  const { dispatch, toast } = useStore();
  const navigate = useNavigate();
  return (
    <div className="stack narrow">
      <h1>New prayer request</h1>
      <PrayerForm
        initial={{ title: '', person: '', details: '', tags: [], scripture: '', schedule: { kind: 'auto' }, followUpOn: null }}
        submitLabel="Add prayer"
        onSubmit={(v) => {
          dispatch({ type: 'add', input: v });
          toast('Prayer added');
          navigate('/prayers');
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
