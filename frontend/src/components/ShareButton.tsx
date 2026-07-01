import { useEffect, useRef, useState } from 'react';
import { useShare, type ShareKind, type SharePhase } from '@/hooks/useShare';
import type { ShareState } from '@/share/types';

interface ShareButtonProps {
  state: ShareState;
}

const OPTIONS: { kind: ShareKind; label: string; hint: string }[] = [
  { kind: 'short', label: '🔗 Short link', hint: 'Store the workspace and copy a short /s/… link' },
  { kind: 'full', label: '📄 Full link', hint: 'Copy a link with the whole workspace encoded in the URL' },
];

function statusText(phase: SharePhase, kind: ShareKind): string {
  if (phase.status === 'idle' || phase.kind !== kind) return '';
  if (phase.status === 'creating') return '…';
  if (phase.status === 'copied') return '✓ Copied';
  return '⚠ Failed';
}

export default function ShareButton({ state }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { config, events } = useShare(state);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="share-picker" ref={rootRef}>
      <button
        className="pane-action share-button"
        onClick={() => setOpen((o) => !o)}
        title="Share this workspace"
      >
        🔗 Share ▾
      </button>
      {open && (
        <div className="share-menu">
          {OPTIONS.map(({ kind, label, hint }) => (
            <button
              key={kind}
              className="share-item"
              title={hint}
              disabled={config.isBusy}
              onClick={() => void events.copyLink(kind)}
            >
              <span>{label}</span>
              <span className="share-item-status">{statusText(config.phase, kind)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
