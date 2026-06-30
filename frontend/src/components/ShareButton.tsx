interface ShareButtonProps {
  status: 'idle' | 'copied' | 'error';
  onShare: () => void;
}

const LABEL = {
  idle: '🔗 Share',
  copied: '✓ Link copied',
  error: '⚠ Copy failed',
} as const;

export default function ShareButton({ status, onShare }: ShareButtonProps) {
  return (
    <button className="pane-action share-button" onClick={onShare} title="Copy a link to this workspace">
      {LABEL[status]}
    </button>
  );
}
