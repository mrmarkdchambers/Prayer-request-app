import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { answeredByMonth, computeStats } from '../lib/stats';
import { formatDate, waitedLabel } from '../lib/util';
import { APP_NAME, hasDonationLinks } from '../config';

export function AnsweredPage() {
  const { data, dispatch } = useStore();
  const stats = computeStats(data.prayers);
  const groups = answeredByMonth(data.prayers);
  const showSupport = hasDonationLinks && !data.settings.supportPromptDismissed && stats.answered >= 3;

  return (
    <div className="stack">
      <h1>Answered prayers</h1>
      <p className="muted">A record of God's faithfulness, to look back on and give thanks.</p>

      <section className="stats-row" aria-label="Answered prayer stats">
        <div className="stat">
          <strong>{stats.answered}</strong> answered in all
        </div>
        <div className="stat">
          <strong>{stats.answeredThisYear}</strong> this year
        </div>
        {stats.averageDaysToAnswer !== null && (
          <div className="stat">
            <strong>{stats.averageDaysToAnswer}</strong> days on average
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

      {groups.length === 0 && <p className="empty">When you mark a prayer as answered, it'll appear here with your notes.</p>}

      {groups.map(([month, prayers]) => (
        <section key={month} className="stack-sm">
          <h2 className="section-title">{month}</h2>
          <ol className="timeline">
            {prayers.map((p) => (
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
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
