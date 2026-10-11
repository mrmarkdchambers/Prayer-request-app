import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Prayer } from '../lib/types';
import { formatDate } from '../lib/util';

/** A clean printable prayer list. Use the browser's "Save as PDF" to make a PDF. */
export function PrintPage() {
  const { data } = useStore();
  const active = data.prayers.filter((p) => p.status === 'active');
  const groups = new Map<string, Prayer[]>();
  for (const p of active) {
    const key = p.tags[0] ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));

  return (
    <div className="print-page">
      <div className="row no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <Link to="/settings" className="btn">
          Back
        </Link>
      </div>
      <h1>Prayer List</h1>
      <p className="muted">{formatDate(new Date().toISOString())} · {active.length} active requests</p>
      {sorted.map(([tag, prayers]) => (
        <section key={tag}>
          <h2>{tag === 'Other' ? 'Other' : `#${tag}`}</h2>
          <ul>
            {prayers.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong>
                {p.person && <> · {p.person}</>}
                {p.details && <div className="print-details">{p.details}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
