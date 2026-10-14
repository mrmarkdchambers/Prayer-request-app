import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { scheduleLabel } from '../lib/prayers';
import { waitedLabel, formatDate, formatRelative, isSameDay, dayKey, dayToIso } from '../lib/util';
import { PrayerForm } from '../components/PrayerForm';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { useAccount } from '../sync/AccountProvider';
import { supabase } from '../sync/client';
import * as api from '../sync/api';

/** For a request shared with a group: who's been praying. */
function useIntercessions(prayerId: string | undefined, shared: boolean, refreshKey: unknown) {
  const [list, setList] = useState<api.Intercession[] | null>(null);
  useEffect(() => {
    if (!supabase || !prayerId || !shared) {
      setList(null);
      return;
    }
    api.intercessionsFor(supabase, prayerId).then(setList, () => setList(null));
  }, [prayerId, shared, refreshKey]);
  return list;
}

export function PrayerPage() {
  const { id } = useParams();
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();
  const prayer = data.prayers.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [answerNote, setAnswerNote] = useState('');
  const [updateText, setUpdateText] = useState('');
  const account = useAccount();
  const intercessions = useIntercessions(prayer?.id, !!prayer?.groupId && !!account.userId, account.lastSynced);
  const sharedWith = prayer?.groupId ? account.groups?.find((g) => g.id === prayer.groupId) : undefined;

  if (!prayer) {
    return (
      <div className="stack">
        <h1>Prayer not found</h1>
        <Link to="/prayers">Back to your list</Link>
      </div>
    );
  }

  const praise = prayer.kind === 'praise';

  if (editing) {
    return (
      <div className="stack narrow">
        <h1>Edit prayer</h1>
        <PrayerForm
          kind={prayer.kind}
          initial={{
            title: prayer.title,
            person: prayer.person,
            details: prayer.details,
            tags: prayer.tags,
            scripture: prayer.scripture,
            schedule: prayer.schedule,
            followUpOn: prayer.followUpOn,
            groupId: prayer.groupId,
            praisedOn: prayer.answeredAt ? dayKey(new Date(prayer.answeredAt)) : undefined,
          }}
          submitLabel="Save"
          onSubmit={(v) => {
            const { praisedOn, ...fields } = v;
            const patch = praise && praisedOn ? { ...fields, answeredAt: dayToIso(praisedOn) } : fields;
            dispatch({ type: 'edit', id: prayer.id, patch });
            setEditing(false);
            toast('Saved');
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const prayedToday = isSameDay(prayer.lastPrayedAt, new Date());
  const addUpdate = (e: FormEvent) => {
    e.preventDefault();
    if (!updateText.trim()) return;
    dispatch({ type: 'addUpdate', id: prayer.id, text: updateText });
    setUpdateText('');
  };

  return (
    <div className="stack narrow">
      <Link to={praise ? '/praise' : '/prayers'} className="back">
        <Icon name="back" /> {praise ? 'Praise' : 'Prayers'}
      </Link>
      <header className="stack-sm">
        <div className="row space-between wrap">
          <h1>{prayer.title}</h1>
          {praise ? (
            <span className="badge badge-praise">{prayer.status === 'archived' ? 'archived' : 'praise'}</span>
          ) : (
            prayer.status !== 'active' && <span className={`badge badge-${prayer.status}`}>{prayer.status}</span>
          )}
        </div>
        {prayer.person && <p className="person">for {prayer.person}</p>}
        {prayer.tags.length > 0 && (
          <div className="chips">
            {prayer.tags.map((t) => (
              <Link key={t} to={`/prayers?tag=${encodeURIComponent(t)}`} className="chip">
                #{t}
              </Link>
            ))}
          </div>
        )}
      </header>

      {prayer.groupId && (
        <p className="shared-note">
          <Icon name="users" size={16} />{' '}
          {sharedWith ? (
            <>
              Shared with <Link to={`/groups/${sharedWith.id}`}>{sharedWith.name}</Link>
            </>
          ) : (
            'Shared with a group'
          )}
          {intercessions && intercessions.length > 0 && (
            <>
              {' '}
              · prayed for by {[...new Set(intercessions.map((i) => i.displayName))].join(', ')} ({intercessions.length}{' '}
              {intercessions.length === 1 ? 'time' : 'times'})
            </>
          )}
        </p>
      )}

      {prayer.details && <p className="details">{prayer.details}</p>}
      {prayer.scripture && <blockquote className="scripture">{prayer.scripture}</blockquote>}

      {!praise && prayer.status === 'answered' && prayer.answeredAt && (
        <section className="card answered-card">
          <h2>Answered {formatDate(prayer.answeredAt)}</h2>
          {prayer.answerNote && <p>{prayer.answerNote}</p>}
          <p className="muted">Answered {waitedLabel(prayer.createdAt, prayer.answeredAt)}.</p>
        </section>
      )}

      {praise ? (
        <dl className="facts">
          <div>
            <dt>Praise report</dt>
            <dd>{prayer.answeredAt ? formatDate(prayer.answeredAt) : formatDate(prayer.createdAt)}</dd>
          </div>
        </dl>
      ) : (
      <dl className="facts">
        <div>
          <dt>Prayed</dt>
          <dd>
            {prayer.prayedCount} {prayer.prayedCount === 1 ? 'time' : 'times'}
            {prayer.lastPrayedAt && <> · last {formatRelative(prayer.lastPrayedAt)}</>}
          </dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>{scheduleLabel(prayer.schedule)}</dd>
        </div>
        <div>
          <dt>Added</dt>
          <dd>{formatDate(prayer.createdAt)}</dd>
        </div>
        {prayer.followUpOn && (
          <div>
            <dt>Follow up</dt>
            <dd>{formatDate(`${prayer.followUpOn}T12:00:00`)}</dd>
          </div>
        )}
      </dl>
      )}

      <div className="row wrap">
        {prayer.status === 'active' && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                dispatch({ type: 'prayed', id: prayer.id });
                toast('Amen');
              }}
            >
              <Icon name="hands" /> {prayedToday ? 'Prayed again' : 'I prayed'}
            </button>
            <button type="button" className="btn btn-success" onClick={() => setAnswerOpen(true)}>
              <Icon name="check" /> Answered
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" /> Edit
        </button>
        {prayer.status === 'active' || (praise && prayer.status === 'answered') ? (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'archive', id: prayer.id })}>
            Archive
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'reopen', id: prayer.id })}>
            {praise ? 'Restore' : 'Move back to active'}
          </button>
        )}
        <button type="button" className="btn btn-danger-ghost" onClick={() => setDeleteOpen(true)}>
          <Icon name="trash" /> Delete
        </button>
      </div>

      <section className="stack-sm">
        <h2 className="section-title">Updates</h2>
        <form className="row" onSubmit={addUpdate}>
          <label htmlFor="update" className="sr-only">
            Add an update
          </label>
          <input id="update" value={updateText} onChange={(e) => setUpdateText(e.target.value)} placeholder="Add an update, e.g. surgery moved to Tuesday" />
          <button type="submit" className="btn" disabled={!updateText.trim()}>
            Post
          </button>
        </form>
        <ol className="timeline">
          {[...prayer.updates].reverse().map((u) => (
            <li key={u.id} className={`timeline-item kind-${u.kind}`}>
              <div className="timeline-meta">
                <time dateTime={u.at}>{formatDate(u.at)}</time>
                {u.kind === 'note' && (
                  <button type="button" className="link muted" onClick={() => dispatch({ type: 'deleteUpdate', id: prayer.id, updateId: u.id })} aria-label="Delete update">
                    remove
                  </button>
                )}
              </div>
              <p>{u.text}</p>
            </li>
          ))}
          <li className="timeline-item kind-created">
            <div className="timeline-meta">
              <time dateTime={prayer.createdAt}>{formatDate(prayer.createdAt)}</time>
            </div>
            <p>{praise ? 'Praise report added' : 'Request added'}</p>
          </li>
        </ol>
      </section>

      <Dialog open={answerOpen} onClose={() => setAnswerOpen(false)} title="Praise God! How was it answered?">
        <textarea rows={4} value={answerNote} onChange={(e) => setAnswerNote(e.target.value)} aria-label="How it was answered" placeholder="Optional: write down what happened so you can remember it." />
        <div className="row">
          <button
            type="button"
            className="btn btn-success"
            onClick={() => {
              dispatch({ type: 'answered', id: prayer.id, note: answerNote });
              setAnswerOpen(false);
              setAnswerNote('');
              toast('Marked as answered');
            }}
          >
            Mark answered
          </button>
          <button type="button" className="btn" onClick={() => setAnswerOpen(false)}>
            Cancel
          </button>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this prayer?">
        <p>This removes it and its updates for good. To keep it but hide it from your list, archive it instead.</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              dispatch({ type: 'delete', id: prayer.id });
              toast('Deleted');
              navigate('/prayers');
            }}
          >
            Delete
          </button>
          <button type="button" className="btn" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>
        </div>
      </Dialog>
    </div>
  );
}
