import { useState, useEffect } from 'react';
import type { CheckerInfo } from '@/types';

interface UseCheckerCatalogArgs {
  initialSelectedCheckerIds?: string[] | null;
}

// Loads the available checkers and holds the current selection. The selection
// defaults to all available checkers, and a restored selection is filtered to
// those that still exist.
export function useCheckerCatalog({ initialSelectedCheckerIds }: UseCheckerCatalogArgs = {}) {
  const [checkers, setCheckers] = useState<CheckerInfo[]>([]);
  const [selectedCheckerIds, setSelectedCheckerIds] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/checkers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CheckerInfo[]>;
      })
      .then((data) => {
        setCheckers(data);
        const available = new Set(data.map((c) => c.id));
        setSelectedCheckerIds(
          initialSelectedCheckerIds
            ? initialSelectedCheckerIds.filter((id) => available.has(id))
            : data.map((c) => c.id)
        );
      })
      .catch((err) => console.error('Failed to load checkers:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    field: { checkers, selectedCheckerIds },
    events: { setSelectedCheckerIds },
  };
}
