import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { buildSession, followUpsDue, prayedTodayCount } from '../lib/session';
import { QuickAdd } from '../components/QuickAdd';
import { PrayerCard } from '../components/PrayerCard';
import { Icon } from '../components/Icon';
import { computeStats } from '../lib/stats';

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function TodayPage() {
  const { data } = useStore();
  const now = new Date();
  const session = buildSession(data.prayers, now, data.settings.sessionSize);
  const prayedToday = prayedTodayCount(data.prayers, now);
  const followUps = followUpsDue(data.prayers, now);
  const stats = computeStats(data.prayers, now);
  const isEmpty = data.prayers.length === 0;

  return (
    <div className="stack">
      <h1>{greeting(now)}</h1>

      {isEmpty ? (
        <section className="card welcome">
          <h2>Welcome</h2>
          <p>
            Keep track of what you're praying for, pray through a few requests each day, and look back on answered prayers. Everything stays private
            on this device.
          </p>
          <p>Add your first request below, or paste a whole list with "Add many at once".</p>
        </section>
      ) : (
        <section className="card session-card">
          {session.length > 0 ? (
            <>
              <h2>Today's prayers</h2>
              <p>
                {session.length} {session.length === 1 ? 'request is' : 'requests are'} ready
                {prayedToday > 0 && <> · {prayedToday} prayed already today</>}.
              </p>
              <Link to="/session" className="btn btn-primary btn-lg">
                <Icon name="hands" /> Start praying
              </Link>
            </>
          ) : (
            <>
              <h2>All done for today</h2>
              <p>
                You prayed for {prayedToday} {prayedToday === 1 ? 'request' : 'requests'} today.{' '}
                {stats.active > 0 && <Link to="/prayers">Browse your list</Link>}
              </p>
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="section-title">Add a request</h2>
        <QuickAdd />
      </section>

      {followUps.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Follow up</h2>
          <p className="muted">Check in on these and add an update.</p>
          {followUps.map((p) => (
            <PrayerCard key={p.id} prayer={p} />
          ))}
        </section>
      )}

      {!isEmpty && (
        <section className="stats-row" aria-label="Summary">
          <Link to="/prayers" className="stat">
            <strong>{stats.active}</strong> active
          </Link>
          <Link to="/answered" className="stat">
            <strong>{stats.answered}</strong> answered
          </Link>
          <div className="stat">
            <strong>{stats.totalPrayers}</strong> prayers prayed
          </div>
        </section>
      )}
    </div>
  );
}
