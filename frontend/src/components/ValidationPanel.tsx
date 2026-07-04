import React, { useState } from 'react';
import type { CheckerInfo, CheckerRunState } from '@/types';
import { usePanelResize } from '@/hooks/usePanelResize';
import ValidationTabs from '@/components/ValidationTabs';
import ValidationTabContent from '@/components/ValidationTabContent';

interface ValidationPanelProps {
  checkers: CheckerInfo[];
  selectedCheckerIds: string[];
  checkerStates: Record<string, CheckerRunState>;
}

const ValidationPanel: React.FC<ValidationPanelProps> = ({ checkers, selectedCheckerIds, checkerStates }) => {
  const [activeIdState, setActiveIdState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const resize = usePanelResize();

  const checkerById = new Map(checkers.map((c) => [c.id, c]));
  const ordered = selectedCheckerIds.map((id) => checkerById.get(id)).filter((c): c is CheckerInfo => c != null);

  if (ordered.length === 0) {
    return (
      <div className="validation-panel">
        <div className="validation-empty">No checkers selected</div>
      </div>
    );
  }

  // Derive the active id: keep the user's pick while it is still selected,
  // otherwise fall back to the first selected checker.
  const activeId =
    activeIdState && selectedCheckerIds.includes(activeIdState) ? activeIdState : ordered[0].id;

  return (
    <div
      className={collapsed ? 'validation-panel collapsed' : 'validation-panel'}
      style={collapsed ? undefined : { height: resize.field.height }}
    >
      {collapsed ? null : (
        <div
          className="validation-resizer"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize, double-click to reset"
          onPointerDown={resize.events.startResize}
          onPointerMove={resize.events.moveResize}
          onPointerUp={resize.events.endResize}
          onPointerCancel={resize.events.endResize}
          onDoubleClick={resize.events.resetHeight}
        />
      )}
      <div className="validation-tabbar">
        <ValidationTabs
          checkers={ordered}
          states={checkerStates}
          activeId={activeId}
          onSelect={setActiveIdState}
        />
        <button
          type="button"
          className="validation-collapse"
          aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {collapsed ? null : <ValidationTabContent state={checkerStates[activeId]} />}
    </div>
  );
};

export default ValidationPanel;
