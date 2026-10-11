import { useId, useMemo, useState } from 'react';
import { normalizeTag, tagCounts } from '../lib/tags';
import { useStore } from '../store';

/** Chip-style tag editor with suggestions from tags already in use. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { data } = useStore();
  const [draft, setDraft] = useState('');
  const id = useId();
  const known = useMemo(() => tagCounts(data.prayers.map((p) => p.tags)).map(([t]) => t), [data.prayers]);
  const q = normalizeTag(draft);
  const suggestions = known.filter((t) => !value.includes(t) && (!q || t.startsWith(q))).slice(0, 6);

  const add = (raw: string) => {
    const tags = raw.split(/[\s,]+/).map(normalizeTag).filter(Boolean);
    const next = [...new Set([...value, ...tags])];
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  return (
    <div className="tag-input">
      <label htmlFor={id}>Tags</label>
      <div className="chips">
        {value.map((t) => (
          <button type="button" key={t} className="chip chip-removable" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            #{t} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? 'Add another' : 'family, health, church…'}
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,]$/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="chips suggestions" aria-label="Suggested tags">
          {suggestions.map((t) => (
            <button type="button" key={t} className="chip chip-ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)}>
              +#{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
