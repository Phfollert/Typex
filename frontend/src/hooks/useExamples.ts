import { useState, useEffect } from 'react';
import { loadIndex } from '@/examples/loader';
import type { ExampleEntry } from '@/examples/types';

export function useExamples(): ExampleEntry[] {
  const [entries, setEntries] = useState<ExampleEntry[]>([]);

  useEffect(() => {
    loadIndex()
      .then(setEntries)
      .catch((err) => console.error('Failed to load examples:', err));
  }, []);

  return entries;
}
