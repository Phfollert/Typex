import React from 'react';
import type { CheckerInfo, CheckerRunState } from '@/types';
import { badgeState, badgeTooltip } from '@/validationPanel';

function Badge({ state }: { state: CheckerRunState | undefined }) {
  const b = badgeState(state);
  const tip = badgeTooltip(b);
  if (b.kind === 'idle') return null;
  if (b.kind === 'checking') {
    return <span className="validation-badge validation-spinner" title={tip} aria-label="Running" />;
  }
  if (b.kind === 'clean') return <span className="validation-badge ok" title={tip}>✓</span>;
  if (b.kind === 'error') return <span className="validation-badge fail" title={tip}>✕</span>;
  return <span className="validation-badge count" title={tip}>{b.count}</span>;
}

interface ValidationTabsProps {
  checkers: CheckerInfo[];
  states: Record<string, CheckerRunState>;
  activeId: string | null;
  onSelect: (id: string) => void;
}

const ValidationTabs: React.FC<ValidationTabsProps> = ({ checkers, states, activeId, onSelect }) => (
  <div className="validation-tabs" role="tablist">
    {checkers.map((c) => (
      <button
        key={c.id}
        type="button"
        role="tab"
        aria-selected={c.id === activeId}
        className={`validation-tab${c.id === activeId ? ' active' : ''}`}
        onClick={() => onSelect(c.id)}
      >
        <span className="validation-dot" style={{ background: c.color }} />
        <span className="validation-tab-label">{c.label}</span>
        <Badge state={states[c.id]} />
      </button>
    ))}
  </div>
);

export default ValidationTabs;
