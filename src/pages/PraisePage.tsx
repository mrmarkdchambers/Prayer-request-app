import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { computeStats, praiseByMonth } from '../lib/stats';
import { formatDate, waitedLabel } from '../lib/util';
import { APP_NAME, hasDonationLinks } from '../config';
import { Icon } from '../components/Icon';

/** Answered prayers and praise reports together: a record of what God has done. */
export function PraisePage() {
  const { data, dispatch } = useStore();
  const stats = computeStats(data.prayers);
  const groups = praiseByMonth(data.prayers);
  const total = stats.answered + stats.praiseReports;
  const showSupport = hasDonationLinks && !data.settings.supportPromptDismissed && total >= 3;

  return (
    <div className="stack">
      <div className="row space-between wrap">
        <h1>Praise</h1>
        <Link to="/praise/new" className="btn btn-primary">
          <Icon name="plus" /> Add praise report
        </Link>
      </div>
      <p className="muted">Answered prayers and things to give thanks for, a record of God's faithfulness to look back on.</p>

      <section className="stats-row" aria-label="Praise stats">
        <div className="stat">
          <strong>{stats.answered}</strong> answered {stats.answered === 1 ? 'prayer' : 'prayers'}
        </div>
        <div className="stat">
          <strong>{stats.praiseReports}</strong> praise {stats.praiseReports === 1 ? 'report' : 'reports'}
        </div>
        <div className="stat">
          <strong>{stats.praiseThisYear}</strong> this year
        </div>
        {stats.averageDaysToAnswer !== null && (
          <div className="stat">
            <strong>{stats.averageDaysToAnswer}</strong> days to an answer, on average
          </div>
        )}
      </section>

      {showSupport && (
        <aside className="card support-nudge">
          <p>
            Glad this helps you remember what God has done. {APP_NAME} is free with no ads. If you'd like to help keep it that way,{' '}
            <Link to="/support">you can support it</Link>.
          </p>
          <button type="button" className="link muted" onClick={() => dispatch({ type: 'settings', patch: { supportPromptDismissed: true } })}>
            Don't show this again
          </button>
        </aside>
      )}

      {groups.length === 0 && (
        <p className="empty">
          Add a praise report for something you're thankful for. When you mark a prayer as answered, it appears here too.
        </p>
      )}

      {groups.map(([month, items]) => (
        <section key={month} className="stack-sm">
          <h2 className="section-title">{month}</h2>
          <ol className="timeline">
            {items.map((p) =>
              p.kind === 'praise' ? (
                <li key={p.id} className="timeline-item kind-praise">
                  <div className="timeline-meta">
                    <time dateTime={p.answeredAt!}>{formatDate(p.answeredAt!)}</time>
                    <span>· praise report</span>
                  </div>
                  <Link to={`/prayers/${p.id}`} className="answered-title">
                    {p.title}
                    {p.person && <span className="muted"> · {p.person}</span>}
                  </Link>
                  {p.details && <p>{p.details}</p>}
                </li>
              ) : (
                <li key={p.id} className="timeline-item kind-answered">
                  <div className="timeline-meta">
                    <time dateTime={p.answeredAt!}>{formatDate(p.answeredAt!)}</time>
                    <span>
                      · answered {waitedLabel(p.createdAt, p.answeredAt!)}, {p.prayedCount} {p.prayedCount === 1 ? 'prayer' : 'prayers'}
                    </span>
                  </div>
                  <Link to={`/prayers/${p.id}`} className="answered-title">
                    {p.title}
                    {p.person && <span className="muted"> · {p.person}</span>}
                  </Link>
                  {p.answerNote && <p>{p.answerNote}</p>}
                </li>
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}
