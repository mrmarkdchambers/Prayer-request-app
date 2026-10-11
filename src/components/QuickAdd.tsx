import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { parseBulk } from '../lib/bulk';
import { partialTagAtEnd, tagCounts } from '../lib/tags';
import { Icon } from './Icon';
import { BulkAddDialog } from './BulkAddDialog';

/** One-line capture: "Sarah: healing after surgery #family". */
export function QuickAdd() {
  const { data, dispatch, toast } = useStore();
  const [text, setText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const known = useMemo(() => tagCounts(data.prayers.map((p) => p.tags)).map(([t]) => t), [data.prayers]);
  const partial = partialTagAtEnd(text);
  const suggestions = partial === null ? [] : known.filter((t) => t.startsWith(partial) && t !== partial).slice(0, 5);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const [draft] = parseBulk(text);
    if (!draft) return;
    dispatch({ type: 'add', input: draft });
    setText('');
    toast('Prayer added');
  };

  return (
    <div className="quick-add">
      <form onSubmit={submit} className="quick-add-form">
        <label htmlFor="quick-add" className="sr-only">
          New prayer request
        </label>
        <input id="quick-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="Sarah: healing after surgery #family" autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Add prayer">
          <Icon name="plus" />
          <span className="hide-sm">Add</span>
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="chips suggestions" aria-label="Tag suggestions">
          {suggestions.map((t) => (
            <button type="button" key={t} className="chip chip-ghost" onClick={() => setText(text.replace(/#[^\s#]*$/, `#${t} `))}>
              #{t}
            </button>
          ))}
        </div>
      )}
      <p className="hint">
        Tip: use <code>Name:</code> for who it's for and <code>#tags</code> to organise.{' '}
        <button type="button" className="link" onClick={() => setBulkOpen(true)}>
          Add many at once
        </button>{' '}
        · <Link to="/prayers/new">More options</Link>
      </p>
      <BulkAddDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}
