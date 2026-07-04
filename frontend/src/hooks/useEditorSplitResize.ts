import { useCallback, useEffect, useState } from 'react';

const MIN_COLUMN_WIDTH = 120;

interface DragState {
  pointerId: number;
  leftFile: string;
  rightFile: string;
  startX: number;
  leftWidth: number;
  rightWidth: number;
  pairGrow: number;
}

// Column widths are flex-grow weights per file, so they stay proportional
// through zoom and window resizes. A drag reassigns the two adjacent
// columns' share of their combined weight; other columns are untouched.
export function useEditorSplitResize() {
  const [growByFile, setGrowByFile] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const isResizing = drag !== null;

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, leftFile: string, rightFile: string) => {
      const left = e.currentTarget.previousElementSibling;
      const right = e.currentTarget.nextElementSibling;
      if (!left || !right) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        pointerId: e.pointerId,
        leftFile,
        rightFile,
        startX: e.clientX,
        leftWidth: left.getBoundingClientRect().width,
        rightWidth: right.getBoundingClientRect().width,
        pairGrow: (growByFile[leftFile] ?? 1) + (growByFile[rightFile] ?? 1),
      });
    },
    [growByFile]
  );

  const moveResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const total = drag.leftWidth + drag.rightWidth;
      const min = Math.min(MIN_COLUMN_WIDTH, total / 2);
      const newLeft = Math.min(total - min, Math.max(min, drag.leftWidth + (e.clientX - drag.startX)));
      const leftShare = newLeft / total;
      setGrowByFile((g) => ({
        ...g,
        [drag.leftFile]: drag.pairGrow * leftShare,
        [drag.rightFile]: drag.pairGrow * (1 - leftShare),
      }));
    },
    [drag]
  );

  const endResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag && e.pointerId === drag.pointerId) setDrag(null);
    },
    [drag]
  );

  const equalize = useCallback((leftFile: string, rightFile: string) => {
    setGrowByFile((g) => {
      const half = ((g[leftFile] ?? 1) + (g[rightFile] ?? 1)) / 2;
      return { ...g, [leftFile]: half, [rightFile]: half };
    });
  }, []);

  return {
    field: { growByFile },
    config: { isResizing },
    events: { startResize, moveResize, endResize, equalize },
  };
}
