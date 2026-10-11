import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { filterPrayers, sortPrayers, type PrayerFilter } from '../lib/prayers';
import { tagCounts } from '../lib/tags';
import { PrayerCard } from '../components/PrayerCard';
import { QuickAdd } from '../components/QuickAdd';
import { Icon } from '../components/Icon';

const STATUS_TABS: { value: PrayerFilter['status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'answered', label: 'Answered' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

export function ListPage() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const filter: PrayerFilter = {
    query: params.get('q') ?? '',
    status: (params.get('status') as PrayerFilter['status']) ?? 'active',
    tag: params.get('tag'),
    person: params.get('person'),
  };
  const update = (patch: Partial<Record<'q' | 'status' | 'tag' | 'person', string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const tags = useMemo(() => tagCounts(data.prayers.map((p) => p.tags)), [data.prayers]);
  const people = useMemo(() => [...new Set(data.prayers.map((p) => p.person).filter(Boolean))].sort(), [data.prayers]);
  const results = sortPrayers(filterPrayers(data.prayers, filter));

  return (
    <div className="stack">
      <div className="row space-between">
        <h1>Prayers</h1>
        <Link to="/prayers/new" className="btn">
          <Icon name="plus" /> New
        </Link>
      </div>
      <QuickAdd />

      <div className="filters">
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">Search prayers</span>
          <input type="search" placeholder="Search" value={filter.query} onChange={(e) => update({ q: e.target.value })} />
        </label>
        <div className="tabs" role="group" aria-label="Status">
          {STATUS_TABS.map((t) => (
            <button key={t.value} type="button" className="tab" aria-pressed={filter.status === t.value} onClick={() => update({ status: t.value === 'active' ? null : t.value })}>
              {t.label}
            </button>
          ))}
        </div>
        {(tags.length > 0 || people.length > 0) && (
          <div className="row wrap">
            {tags.length > 0 && (
              <label className="inline">
                Tag
                <select value={filter.tag ?? ''} onChange={(e) => update({ tag: e.target.value || null })}>
                  <option value="">All tags</option>
                  {tags.map(([t, n]) => (
                    <option key={t} value={t}>
                      #{t} ({n})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {people.length > 0 && (
              <label className="inline">
                Person
                <select value={filter.person ?? ''} onChange={(e) => update({ person: e.target.value || null })}>
                  <option value="">Everyone</option>
                  {people.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      <p className="muted" aria-live="polite">
        {results.length} {results.length === 1 ? 'prayer' : 'prayers'}
      </p>
      <div className="grid">
        {results.map((p) => (
          <PrayerCard key={p.id} prayer={p} onTag={(t) => update({ tag: t })} />
        ))}
      </div>
      {results.length === 0 && data.prayers.length > 0 && <p className="empty">Nothing matches these filters.</p>}
    </div>
  );
}
