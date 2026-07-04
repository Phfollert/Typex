import { useCallback, useEffect, useState } from 'react';

const DEFAULT_HEIGHT = 220;

interface DragState {
  pointerId: number;
  panelBottom: number;
}

// Height limits are owned by the .validation-panel min/max-height rules in
// App.css; the hook only requests a height and syncs to the rendered result.
export function usePanelResize() {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isResizing = drag !== null;

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const panel = e.currentTarget.parentElement;
    if (!panel) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      panelBottom: panel.getBoundingClientRect().bottom,
    });
  }, []);

  const moveResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      // A negative inline height would be ignored, letting the stylesheet
      // height kick back in mid-drag.
      setHeight(Math.max(0, Math.round(drag.panelBottom - e.clientY)));
    },
    [drag]
  );

  const endResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      setDrag(null);
      const panel = e.currentTarget.parentElement;
      if (panel) setHeight(Math.round(panel.getBoundingClientRect().height));
    },
    [drag]
  );

  const resetHeight = useCallback(() => setHeight(DEFAULT_HEIGHT), []);

  return {
    field: { height },
    config: { isResizing },
    events: { startResize, moveResize, endResize, resetHeight },
  };
}
