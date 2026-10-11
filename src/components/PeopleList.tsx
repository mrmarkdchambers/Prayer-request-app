import { useMemo } from 'react';
import { useStore } from '../store';

/** <datalist> of people already used, so the "For whom" field autocompletes. */
export function PeopleList() {
  const { data } = useStore();
  const people = useMemo(() => [...new Set(data.prayers.map((p) => p.person).filter(Boolean))].sort(), [data.prayers]);
  return (
    <datalist id="people">
      {people.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}
