import { useState } from 'react';
import { useStore } from '../store';
import { parseBulk } from '../lib/bulk';
import { Dialog } from './Dialog';

export function BulkAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch, toast } = useStore();
  const [text, setText] = useState('');
  const drafts = parseBulk(text);

  const add = () => {
    if (!drafts.length) return;
    dispatch({ type: 'addMany', inputs: drafts });
    toast(`Added ${drafts.length} prayer${drafts.length === 1 ? '' : 's'}`);
    setText('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add many prayers">
      <p className="muted">Paste or type one request per line. Bullets and numbers are fine.</p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Prayer requests, one per line"
        placeholder={'Sarah: healing after surgery #family\nTom: new job #work\nOur church youth retreat'}
      />
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!drafts.length} onClick={add}>
          Add {drafts.length || ''} prayer{drafts.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
