import { Link } from 'react-router-dom';
import type { Prayer } from '../lib/types';
import { formatRelative } from '../lib/util';

export function PrayerCard({ prayer, onTag }: { prayer: Prayer; onTag?: (tag: string) => void }) {
  const latest = prayer.updates.filter((u) => u.kind === 'note').at(-1);
  return (
    <article className={`card prayer-card status-${prayer.status}`}>
      <Link to={`/prayers/${prayer.id}`} className="card-link">
        <div className="card-head">
          <h3>{prayer.title}</h3>
          {prayer.status !== 'active' && <span className={`badge badge-${prayer.status}`}>{prayer.status}</span>}
        </div>
        {prayer.person && <p className="person">for {prayer.person}</p>}
        {latest && <p className="latest">Update: {latest.text}</p>}
        <p className="meta">
          Prayed {prayer.prayedCount} {prayer.prayedCount === 1 ? 'time' : 'times'}
          {prayer.lastPrayedAt && <> · last {formatRelative(prayer.lastPrayedAt)}</>}
        </p>
      </Link>
      {prayer.tags.length > 0 && (
        <div className="chips">
          {prayer.tags.map((t) =>
            onTag ? (
              <button type="button" key={t} className="chip" onClick={() => onTag(t)} aria-label={`Filter by tag ${t}`}>
                #{t}
              </button>
            ) : (
              <span key={t} className="chip">
                #{t}
              </span>
            ),
          )}
        </div>
      )}
    </article>
  );
}
