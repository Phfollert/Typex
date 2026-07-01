import React from 'react';
import VersionPicker from '@/components/VersionPicker';
import type { CheckerInfo } from '@/types';

function runStatusLabel(isChecking: boolean, isValid: boolean, runSummary: string | null): string {
  if (isChecking) return 'Checking…';
  if (!isValid) return 'Invalid syntax';
  return runSummary ?? '';
}

interface ToolbarProps {
  checkers: CheckerInfo[];
  targetVersion: string;
  setTargetVersion: (version: string) => void;
  selectedCheckerIds: string[];
  setSelectedCheckerIds: (ids: string[]) => void;
  isValid: boolean;
  isChecking: boolean;
  runSummary: string | null;
}

const Toolbar: React.FC<ToolbarProps> = ({
  checkers,
  targetVersion,
  setTargetVersion,
  selectedCheckerIds,
  setSelectedCheckerIds,
  isValid,
  isChecking,
  runSummary
}) => {
  const toggleTypechecker = (id: string) => {
    if (selectedCheckerIds.includes(id)) {
      setSelectedCheckerIds(selectedCheckerIds.filter(t => t !== id));
    } else {
      setSelectedCheckerIds([...selectedCheckerIds, id]);
    }
  };

  return (
    <div className="toolbar">
      <span className="run-status">
        {runStatusLabel(isChecking, isValid, runSummary)}
      </span>

      <div className="typecheckers-container">
        {checkers.map(tc => {
          const active = selectedCheckerIds.includes(tc.id);
          return (
            <button
              key={tc.id}
              type="button"
              className={`checker-chip${active ? '' : ' off'}`}
              style={{ ['--c' as string]: tc.color }}
              aria-pressed={active}
              onClick={() => toggleTypechecker(tc.id)}
              title={active ? `Hide ${tc.label}` : `Show ${tc.label}`}
            >
              {tc.label}
            </button>
          );
        })}
      </div>

      <div className="version-selector-container">
        <label>Target</label>
        <VersionPicker value={targetVersion} onChange={setTargetVersion} />
      </div>
    </div>
  );
};

export default Toolbar;
