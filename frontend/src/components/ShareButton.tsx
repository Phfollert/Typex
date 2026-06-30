import { useState } from 'react';
import { createShareLink } from '@/share/url';
import type { ShareState } from '@/share/types';

type ShareStatus = 'idle' | 'copied' | 'error';

const LABEL = {
  idle: '🔗 Share',
  copied: '✓ Link copied',
  error: '⚠ Copy failed',
} as const;

interface ShareButtonProps {
  state: ShareState;
}

export default function ShareButton({ state }: ShareButtonProps) {
  const [status, setStatus] = useState<ShareStatus>('idle');

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(createShareLink(state));
      setStatus('copied');
    } catch (err) {
      console.error('Failed to create share link:', err);
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <button className="pane-action share-button" onClick={onShare} title="Copy a link to this workspace">
      {LABEL[status]}
    </button>
  );
}
