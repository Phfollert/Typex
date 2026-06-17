import React from 'react';
import type { CheckerInfo } from '../types';

interface ToolbarProps {
  checkers: CheckerInfo[];
  targetVersion: string;
  setTargetVersion: (version: string) => void;
  selectedCheckerIds: string[];
  setSelectedCheckerIds: (ids: string[]) => void;
  isValid: boolean;
  isSubmitting: boolean;
  runSummary: string | null;
}

const Toolbar: React.FC<ToolbarProps> = ({
  checkers,
  targetVersion,
  setTargetVersion,
  selectedCheckerIds,
  setSelectedCheckerIds,
  isValid,
  isSubmitting,
  runSummary
}) => {
  const versions = [
    { value: 'py37', label: 'Python 3.7' },
    { value: 'py38', label: 'Python 3.8' },
    { value: 'py39', label: 'Python 3.9' },
    { value: 'py310', label: 'Python 3.10' },
    { value: 'py311', label: 'Python 3.11' },
    { value: 'py312', label: 'Python 3.12' },
  ];

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
        {isSubmitting
          ? 'Checking…'
          : !isValid
            ? 'Invalid syntax'
            : runSummary
              ? runSummary
              : ''}
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
        <label htmlFor="version-select">Target</label>
        <select
          id="version-select"
          className="version-select"
          value={targetVersion}
          onChange={(e) => setTargetVersion(e.target.value)}
        >
          {versions.map((ver) => (
            <option key={ver.value} value={ver.value}>
              {ver.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default Toolbar;
