import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { buildSession } from '../lib/session';
import { Icon } from '../components/Icon';

function useElapsed(): string {
  const start = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.floor((now - start.current) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Focused, one-at-a-time prayer time. Swipe right or press → when you've prayed; swipe left or press S to skip. */
export function SessionPage() {
  const { data, dispatch } = useStore();
  // Snapshot the list so it doesn't reshuffle as items are marked prayed.
  const [ids] = useState(() => buildSession(data.prayers, new Date(), data.settings.sessionSize).map((p) => p.id));
  const [index, setIndex] = useState(0);
  const [prayed, setPrayed] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const elapsed = useElapsed();
  const touchX = useRef<number | null>(null);

  const items = ids.map((id) => data.prayers.find((p) => p.id === id)).filter((p) => p !== undefined);
  const current = items[index];
  const done = index >= items.length;

  const next = (didPray: boolean) => {
    if (!current) return;
    if (didPray) {
      dispatch({ type: 'prayed', id: current.id });
      setPrayed((n) => n + 1);
    }
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') next(true);
      else if (e.key.toLowerCase() === 's') next(false);
      else if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (items.length === 0) {
    return (
      <div className="stack narrow center">
        <h1>Nothing waiting right now</h1>
        <p>You've prayed for everything in today's rotation.</p>
        <Link to="/" className="btn">
          Back to Today
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="stack narrow center session-done">
        <Icon name="heart" size={48} />
        <h1>Amen</h1>
        <p>
          You prayed for {prayed} {prayed === 1 ? 'request' : 'requests'}
          {showTimer && <> in {elapsed}</>}.
        </p>
        <div className="row center">
          <Link to="/" className="btn btn-primary">
            Done
          </Link>
          <Link to="/prayers" className="btn">
            See all prayers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack narrow session">
      <div className="row space-between">
        <Link to="/" className="back">
          <Icon name="back" /> Exit
        </Link>
        <div className="row">
          <button type="button" className="link muted" onClick={() => setShowTimer((v) => !v)}>
            {showTimer ? elapsed : 'Show timer'}
          </button>
          <span className="muted" aria-live="polite">
            {index + 1} of {items.length}
          </span>
        </div>
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${(index / items.length) * 100}%` }} />
      </div>

      <article
        key={current.id}
        className="card session-item"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx > 80) next(true);
          else if (dx < -80) next(false);
        }}
      >
        {current.person && <p className="person">for {current.person}</p>}
        <h1>{current.title}</h1>
        {current.details && <p className="details">{current.details}</p>}
        {current.scripture && <blockquote className="scripture">{current.scripture}</blockquote>}
        {current.updates.filter((u) => u.kind === 'note').length > 0 && (
          <p className="latest">Latest: {current.updates.filter((u) => u.kind === 'note').at(-1)!.text}</p>
        )}
        {current.tags.length > 0 && (
          <div className="chips">
            {current.tags.map((t) => (
              <span key={t} className="chip">
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>

      <div className="row center">
        <button type="button" className="btn" onClick={() => next(false)}>
          Skip
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => next(true)} autoFocus>
          <Icon name="hands" /> Prayed
        </button>
      </div>
      <p className="hint center">Swipe right when you've prayed, left to skip. On a keyboard: → or Enter, S to skip.</p>
    </div>
  );
}
