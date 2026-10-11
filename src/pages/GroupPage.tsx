import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccount } from '../sync/AccountProvider';
import { useStore } from '../store';
import { supabase } from '../sync/client';
import * as api from '../sync/api';
import { inviteLink, useGroupPrayers } from '../sync/useGroup';
import { dayKey, formatRelative } from '../lib/util';
import { Dialog } from '../components/Dialog';
import { QrCode } from '../components/QrCode';
import { Icon } from '../components/Icon';
import { NamePrompt } from '../components/NamePrompt';

function SharedPrayerCard({ prayer, me, onPray }: { prayer: api.SharedPrayer; me: string; onPray: () => void }) {
  const today = dayKey(new Date());
  const mine = prayer.ownerId === me;
  const prayedToday = prayer.intercessions.some((i) => i.userId === me && i.prayedOn === today);
  const people = [...new Set(prayer.intercessions.map((i) => i.displayName))];
  const latest = prayer.updates.filter((u) => u.kind === 'note').at(-1);

  return (
    <article className={`card prayer-card status-${prayer.status}`}>
      <div className="card-head">
        <h3>{prayer.title}</h3>
        {prayer.status === 'answered' && <span className="badge badge-answered">answered</span>}
      </div>
      <p className="meta">
        {mine ? 'Your request' : `From ${prayer.ownerName}`}
        {prayer.person && <> · for {prayer.person}</>} · {formatRelative(prayer.createdAt)}
      </p>
      {prayer.details && <p className="details">{prayer.details}</p>}
      {latest && (
        <p className="latest">
          Update ({formatRelative(latest.at)}): {latest.text}
        </p>
      )}
      {prayer.status === 'answered' && prayer.answerNote && <p className="answer-note">Praise: {prayer.answerNote}</p>}
      <p className="meta">
        {people.length === 0
          ? 'No one has prayed yet.'
          : `Prayed for by ${people.slice(0, 3).join(', ')}${people.length > 3 ? ` and ${people.length - 3} more` : ''}.`}
      </p>
      <div className="row wrap">
        {prayer.status === 'active' &&
          !mine &&
          (prayedToday ? (
            <span className="prayed-badge">
              <Icon name="check" size={16} /> You prayed today
            </span>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onPray}>
              <Icon name="hands" /> I prayed
            </button>
          ))}
        {mine && (
          <Link to={`/prayers/${prayer.id}`} className="btn">
            <Icon name="edit" /> Update
          </Link>
        )}
      </div>
    </article>
  );
}

export function GroupPage() {
  const { id = '' } = useParams();
  const account = useAccount();
  const { toast } = useStore();
  const navigate = useNavigate();
  const group = account.groups?.find((g) => g.id === id);
  const { prayers, error, refresh, setPrayers } = useGroupPrayers(id, !!group, account.lastSynced);
  const [showQr, setShowQr] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete' | 'reset' | { remove: api.Member }>(null);

  if (!account.userId) return <Link to="/groups">Sign in to see your groups</Link>;
  if (account.groups === null) return <p className="muted">Loading…</p>;
  if (!group) {
    return (
      <div className="stack">
        <h1>Group not found</h1>
        <p>You may have left this group, or it was deleted.</p>
        <Link to="/groups">Back to groups</Link>
      </div>
    );
  }

  const me = account.userId;
  const isOwner = group.members.some((m) => m.userId === me && m.role === 'owner');
  const link = inviteLink(group.inviteCode);

  const pray = async (prayerId: string) => {
    if (!supabase) return;
    // Show it straight away; the server records at most one per day.
    setPrayers((list) =>
      list?.map((p) =>
        p.id === prayerId ? { ...p, intercessions: [...p.intercessions, { userId: me, prayedOn: dayKey(new Date()), displayName: account.displayName || 'You' }] } : p,
      ) ?? null,
    );
    try {
      await api.prayFor(supabase, prayerId, me);
      toast('Amen');
    } catch {
      toast("Couldn't save that. Check your connection.");
      refresh();
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied');
    } catch {
      toast("Couldn't copy. Select the link and copy it instead.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `Join ${group.name}`, text: `Join our prayer group "${group.name}" on Prayer List`, url: link });
    } catch {
      /* cancelled */
    }
  };

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    try {
      await fn();
      await account.refreshGroups();
      account.syncNow(); // pick up any requests the server just made private
      after?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong');
    }
    setConfirm(null);
  };

  const active = prayers?.filter((p) => p.status === 'active') ?? [];
  const answered = prayers?.filter((p) => p.status === 'answered') ?? [];

  return (
    <div className="stack narrow">
      <Link to="/groups" className="back">
        <Icon name="back" /> Groups
      </Link>
      {renaming ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.renameGroup(supabase!, group.id, newName), () => setRenaming(false));
          }}
        >
          <label htmlFor="rename" className="sr-only">
            Group name
          </label>
          <input id="rename" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
            Save
          </button>
          <button type="button" className="btn" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="row space-between wrap">
          <h1>{group.name}</h1>
          {isOwner && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setNewName(group.name);
                setRenaming(true);
              }}
            >
              Rename
            </button>
          )}
        </div>
      )}

      <NamePrompt />
      <div className="row wrap">
        <Link to={`/prayers/new?group=${group.id}`} className="btn btn-primary">
          <Icon name="plus" /> Share a request
        </Link>
      </div>

      <section className="stack-sm" aria-labelledby="requests">
        <h2 id="requests" className="section-title">
          Requests
        </h2>
        {error && <p className="error">Couldn't load requests. Check your connection.</p>}
        {prayers === null && !error && <p className="muted">Loading…</p>}
        {prayers && active.length === 0 && <p className="empty">No requests yet. Share one to get started.</p>}
        {active.map((p) => (
          <SharedPrayerCard key={p.id} prayer={p} me={me} onPray={() => pray(p.id)} />
        ))}
      </section>

      {answered.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Answered</h2>
          {answered.map((p) => (
            <SharedPrayerCard key={p.id} prayer={p} me={me} onPray={() => {}} />
          ))}
        </section>
      )}

      <section className="card stack-sm">
        <h2>Invite people</h2>
        <p className="muted">Anyone with this link can join the group and see its requests, so only share it with people you trust.</p>
        <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <div className="row wrap">
          <button type="button" className="btn" onClick={copy}>
            Copy link
          </button>
          {'share' in navigator && (
            <button type="button" className="btn" onClick={share}>
              Share…
            </button>
          )}
          <button type="button" className="btn" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
            {showQr ? 'Hide QR code' : 'Show QR code'}
          </button>
        </div>
        {showQr && <QrCode text={link} label={`QR code to join ${group.name}`} />}
        {isOwner && (
          <button type="button" className="link align-start" onClick={() => setConfirm('reset')}>
            Make a new link (the old one stops working)
          </button>
        )}
      </section>

      <section className="card stack-sm">
        <h2>
          Members <span className="muted">({group.members.length})</span>
        </h2>
        <ul className="list-plain members">
          {group.members.map((m) => (
            <li key={m.userId} className="row space-between">
              <span>
                {m.displayName}
                {m.userId === me && ' (you)'}
                {m.role === 'owner' && <span className="muted"> · leader</span>}
              </span>
              {isOwner && m.userId !== me && (
                <button type="button" className="link muted" onClick={() => setConfirm({ remove: m })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <button type="button" className="btn btn-danger-ghost align-start" onClick={() => setConfirm('delete')}>
            Delete group
          </button>
        ) : (
          <button type="button" className="btn btn-danger-ghost align-start" onClick={() => setConfirm('leave')}>
            Leave group
          </button>
        )}
      </section>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === 'leave'
            ? `Leave ${group.name}?`
            : confirm === 'delete'
              ? `Delete ${group.name}?`
              : confirm === 'reset'
                ? 'Make a new invite link?'
                : `Remove ${typeof confirm === 'object' && confirm ? confirm.remove.displayName : ''}?`
        }
      >
        <p>
          {confirm === 'leave' && "Your requests will stop being shared with this group. They'll stay in your own list."}
          {confirm === 'delete' && "Everyone will lose access to the group. Each person's requests stay in their own list, made private."}
          {confirm === 'reset' && "The current link and QR code will stop working. People already in the group aren't affected."}
          {typeof confirm === 'object' && confirm && "They'll lose access to this group, and their requests will no longer be shared with it."}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm === 'leave') run(() => api.removeMember(supabase!, group.id, me), () => navigate('/groups'));
              else if (confirm === 'delete') run(() => api.deleteGroup(supabase!, group.id), () => navigate('/groups'));
              else if (confirm === 'reset') run(() => api.resetInviteCode(supabase!, group.id));
              else if (typeof confirm === 'object' && confirm) run(() => api.removeMember(supabase!, group.id, confirm.remove.userId));
            }}
          >
            {confirm === 'leave' ? 'Leave' : confirm === 'delete' ? 'Delete' : confirm === 'reset' ? 'Make new link' : 'Remove'}
          </button>
          <button type="button" className="btn" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </Dialog>
    </div>
  );
}
