import { useState, useEffect, useRef } from 'react';
import type { CheckerInfo, CheckerResult, EditorDiagnostic } from '@/types';

const AUTO_RUN_DELAY = 800; // ms of inactivity before auto-running the checkers

// Ruff target ("py312") -> backend python_version ("3.12")
function ruffToPythonVersion(target: string): string {
  const digits = target.replace('py', '');
  return `${digits[0]}.${digits.slice(1)}`;
}

interface UseCheckerRunArgs {
  files: Record<string, string>;
  targetVersion: string;
  isReady: boolean;
  canRun: boolean;
}

export function useCheckerRun({ files, targetVersion, isReady, canRun }: UseCheckerRunArgs) {
  const [checkers, setCheckers] = useState<CheckerInfo[]>([]);
  const [selectedCheckerIds, setSelectedCheckerIds] = useState<string[]>([]);
  const [typecheckerDiagnostics, setTypecheckerDiagnostics] = useState<EditorDiagnostic[]>([]);
  // isSubmitting (in flight) and runSummary (last result) are independent on purpose.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const logError = (msg: string) => {
    console.error(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  // Load checkers from the backend.
  useEffect(() => {
    fetch('/api/checkers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CheckerInfo[]>;
      })
      .then((data) => {
        setCheckers(data);
        setSelectedCheckerIds(data.map((c) => c.id));
      })
      .catch((err) => console.error('Failed to load checkers:', err));
  }, []);

  // Clear squiggles on any file change.
  useEffect(() => {
    setTypecheckerDiagnostics([]);
  }, [files]);

  const runCheckers = async (runId: number) => {
    setIsSubmitting(true);
    const pythonVersion = ruffToPythonVersion(targetVersion);

    try {
      const settled = await Promise.allSettled(
        selectedCheckerIds.map((id) =>
          fetch(`/api/checkers/${id}/typecheck`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files, python_version: pythonVersion }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<CheckerResult>;
          })
        )
      );

      // A newer run (or edit) started while this one was in flight; drop stale results.
      if (runId !== runIdRef.current) return;

      const newDiags: EditorDiagnostic[] = [];
      const checkerById = new Map(checkers.map((c) => [c.id, c]));
      let checkersWithIssues = 0;
      settled.forEach((outcome, i) => {
        const id = selectedCheckerIds[i];
        if (outcome.status === 'rejected') {
          logError(`[${id}] request failed: ${outcome.reason}`);
          return;
        }
        const result = outcome.value;
        const info = checkerById.get(id);
        if (!info) {
          logError(`[${id}] unknown checker id; dropping ${result.diagnostics.length} diagnostics`);
          return;
        }
        if (result.diagnostics.some((d) => d.severity !== 'information')) checkersWithIssues++;
        for (const d of result.diagnostics) {
          newDiags.push({
            file: d.file,
            checkerLabel: info.label,
            color: info.color,
            line: d.line,
            character: d.column,
            endLine: d.end_line,
            endColumn: d.end_column,
            message: d.code ? `${d.message} (${d.code})` : d.message,
            severity: d.severity,
          });
        }
      });

      setTypecheckerDiagnostics(newDiags);
      setRunSummary(
        checkersWithIssues > 0
          ? `${checkersWithIssues} typechecker${checkersWithIssues === 1 ? '' : 's'} found issues`
          : 'No issues found'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-run once edits pause for AUTO_RUN_DELAY; each change restarts the timer.
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (!isReady) return;
    // Nothing selected: clear results instead of leaving the last run on screen.
    if (selectedCheckerIds.length === 0) {
      setTypecheckerDiagnostics([]);
      setRunSummary(null);
      return;
    }
    if (!canRun) return;
    const handle = setTimeout(() => runCheckers(runId), AUTO_RUN_DELAY);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, targetVersion, selectedCheckerIds, canRun, isReady]);

  return {
    field: { checkers, selectedCheckerIds, typecheckerDiagnostics },
    config: { isSubmitting, runSummary },
    events: { setSelectedCheckerIds },
  };
}
