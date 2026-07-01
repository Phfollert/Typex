import { usePopover } from '@/hooks/usePopover';
import { useShare, type ShareKind, type SharePhase } from '@/hooks/useShare';
import type { ShareState } from '@/share/types';

interface ShareButtonProps {
  state: ShareState;
}

const OPTIONS: { kind: ShareKind; label: string; hint: string }[] = [
  { kind: 'short', label: '🔗 Short link', hint: 'Store the workspace and copy a short /s/… link' },
  { kind: 'full', label: '📄 Full link', hint: 'Copy a link with the whole workspace encoded in the URL' },
];

function triggerLabel(phase: SharePhase): string {
  switch (phase.status) {
    case 'creating':
      return '⏳ Copying…';
    case 'copied':
      return '✓ Link copied';
    case 'error':
      return '⚠ Copy failed';
    default:
      return '🔗 Share ▾';
  }
}

export default function ShareButton({ state }: ShareButtonProps) {
  const { id, triggerRef, popoverRef } = usePopover('end');
  const { config, events } = useShare(state);

  return (
    <div className="share-picker">
      <button
        ref={triggerRef}
        popoverTarget={id}
        className="pane-action share-button"
        title="Share this workspace"
      >
        {triggerLabel(config.phase)}
      </button>
      <div ref={popoverRef} id={id} popover="auto" className="share-menu">
        {OPTIONS.map(({ kind, label, hint }) => (
          <button
            key={kind}
            className="share-item"
            title={hint}
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={() => void events.copyLink(kind)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
