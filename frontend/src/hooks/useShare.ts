import { useCallback, useRef, useState } from 'react';
import { createFullLink, createShortLink } from '@/share/url';
import type { ShareState } from '@/share/types';

export type ShareKind = 'full' | 'short';

export type SharePhase =
  | { status: 'idle' }
  | { status: 'creating'; kind: ShareKind }
  | { status: 'copied'; kind: ShareKind }
  | { status: 'error'; kind: ShareKind };

const RESET_MS = 2000;

export interface UseShare {
  config: { phase: SharePhase; isBusy: boolean };
  events: { copyLink: (kind: ShareKind) => Promise<void> };
}

export function useShare(state: ShareState): UseShare {
  const [phase, setPhase] = useState<SharePhase>({ status: 'idle' });

  const timerRef = useRef<number>(undefined);

  const copyLink = useCallback(async (kind: ShareKind) => {
    setPhase({ status: 'creating', kind });
    try {
      const link = kind === 'full' ? createFullLink(state) : await createShortLink(state);
      if (!link) throw new Error('share store unavailable');
      await navigator.clipboard.writeText(link);
      setPhase({ status: 'copied', kind });
    } catch (err) {
      console.error('Failed to create share link:', err);
      setPhase({ status: 'error', kind });
    }
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPhase({ status: 'idle' }), RESET_MS);
  }, [state]);

  return {
    config: { phase, isBusy: phase.status === 'creating' },
    events: { copyLink },
  };
}
