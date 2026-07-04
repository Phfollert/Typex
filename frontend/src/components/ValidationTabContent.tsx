import React from 'react';
import type { CheckerRunState } from '@/types';
import { tabView } from '@/validationPanel';

interface ValidationTabContentProps {
  state: CheckerRunState | undefined;
}

const ValidationTabContent: React.FC<ValidationTabContentProps> = ({ state }) => {
  // No state means the checker has not run (cleared): show a blank area rather
  // than "No issues", which would wrongly imply the checker ran and found none.
  if (!state) return <div className="validation-content" />;
  const view = tabView(state);
  return (
    <div className={`validation-content${view.dimmed ? ' dimmed' : ''}`}>
      {view.error ? <div className="validation-error">Checker failed: {view.error}</div> : null}
      {view.groups.length === 0 && !view.error ? <div className="validation-empty">No issues</div> : null}
      {view.groups.map((g) => (
        <div key={g.file} className="validation-file">
          <div className="validation-file-head">{g.file}</div>
          {g.diagnostics.map((d, i) => (
            <div key={i} className="validation-row">
              <span className="validation-loc">
                {d.line}:{d.column}
              </span>
              <span className={`validation-msg sev-${d.severity}`}>{d.message}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ValidationTabContent;
