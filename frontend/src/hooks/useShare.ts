import { useCallback, useState } from 'react';
import { encodeState } from '@/share/codec';
import { buildFullLink } from '@/share/url';
import { CURRENT_SHARE_VERSION, type ShareState } from '@/share/types';

type ShareStatus = 'idle' | 'copied' | 'error';

interface UseShareArgs {
  files: Record<string, string>;
  panes: string[];
  selectedCheckerIds: string[];
  targetVersion: string;
}

export function useShare({ files, panes, selectedCheckerIds, targetVersion }: UseShareArgs) {
  const [status, setStatus] = useState<ShareStatus>('idle');

  const share = useCallback(async () => {
    const state: ShareState = {
      v: CURRENT_SHARE_VERSION,
      files,
      panes,
      checkers: selectedCheckerIds,
      py: targetVersion,
    };
    try {
      const link = buildFullLink(window.location.origin, encodeState(state));
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch (err) {
      console.error('Failed to create share link:', err);
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 2000);
  }, [files, panes, selectedCheckerIds, targetVersion]);

  return {
    field: {},
    config: { status },
    events: { share },
  };
}
