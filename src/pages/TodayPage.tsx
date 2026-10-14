import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { buildSession, followUpsDue, prayedTodayCount } from '../lib/session';
import { QuickAdd } from '../components/QuickAdd';
import { PrayerCard } from '../components/PrayerCard';
import { Icon } from '../components/Icon';
import { computeStats } from '../lib/stats';
import { useEffect, useState } from 'react';
import { useAccount } from '../sync/AccountProvider';
import { supabase } from '../sync/client';
import * as api from '../sync/api';
import { dayKey } from '../lib/util';
import { APP_NAME, APP_TAGLINE } from '../config';

/** People in your groups who prayed for your requests this past week. */
function usePrayedForMe(userId: string | null, refreshKey: unknown) {
  const [list, setList] = useState<api.PrayedForYou[]>([]);
  useEffect(() => {
    if (!supabase || !userId) {
      setList([]);
      return;
    }
    const since = dayKey(new Date(Date.now() - 6 * 86_400_000));
    api.prayedForMe(supabase, userId, since).then(setList, () => {});
  }, [userId, refreshKey]);
  return list;
}

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
  const account = useAccount();
  const prayedForMe = usePrayedForMe(account.userId, account.lastSynced);

  return (
    <div className="stack">
      <h1>{greeting(now)}</h1>

      {isEmpty ? (
        <section className="card welcome">
          <h2>Welcome to {APP_NAME}</h2>
          <p className="tagline">{APP_TAGLINE}.</p>
          <p>
            Keep track of what you're praying for, pray through a few requests each day, and look back on answered prayers. It's free and private.
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

      {prayedForMe.length > 0 && (
        <section className="card prayed-for-you" aria-labelledby="prayed-for-you">
          <h2 id="prayed-for-you">
            <Icon name="heart" /> You've been prayed for
          </h2>
          <ul className="list-plain stack-sm">
            {prayedForMe.map((p) => (
              <li key={p.prayerId}>
                <strong>{p.people.join(', ')}</strong> {p.kind === 'praise' ? 'praised God with you for' : 'prayed for'}{' '}
                <Link to={`/prayers/${p.prayerId}`}>{p.title}</Link> this week.
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <Link to="/praise" className="stat">
            <strong>{stats.answered + stats.praiseReports}</strong> praise
          </Link>
          <div className="stat">
            <strong>{stats.totalPrayers}</strong> prayers prayed
          </div>
        </section>
      )}
    </div>
  );
}
