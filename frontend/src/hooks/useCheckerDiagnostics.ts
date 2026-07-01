import { useState, useEffect, useRef } from 'react';
import type { CheckerInfo, CheckerResult, EditorDiagnostic } from '@/types';

const AUTO_RUN_DELAY = 800; // ms of inactivity before auto-checking

// Ruff target ("py312") -> backend python_version ("3.12")
function ruffToPythonVersion(target: string): string {
  const digits = target.replace('py', '');
  return `${digits[0]}.${digits.slice(1)}`;
}

interface UseCheckerDiagnosticsArgs {
  files: Record<string, string>;
  targetVersion: string;
  isReady: boolean;
  canRun: boolean;
  checkers: CheckerInfo[];
  selectedCheckerIds: string[];
}

// Provides typechecker diagnostics for the current files, re-checking (debounced)
// whenever the files, target, or selection change. The backend runs the checkers;
// this hook triggers a check and surfaces its results.
export function useCheckerDiagnostics({
  files,
  targetVersion,
  isReady,
  canRun,
  checkers,
  selectedCheckerIds,
}: UseCheckerDiagnosticsArgs) {
  const [typecheckerDiagnostics, setTypecheckerDiagnostics] = useState<EditorDiagnostic[]>([]);
  // isChecking (in flight) and runSummary (last result) are independent on purpose.
  const [isChecking, setIsChecking] = useState(false);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  // Latest issued run id; any edit bumps it, invalidating in-flight runs.
  const runIdRef = useRef(0);
  // The run currently driving isChecking. Only this run may clear the flag, so
  // a stale run finishing late never turns "checking" off under a newer run.
  const pendingRunRef = useRef<number | null>(null);

  const logError = (msg: string) => {
    console.error(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  // Clear squiggles on any file change.
  useEffect(() => {
    setTypecheckerDiagnostics([]);
  }, [files]);

  const check = async (runId: number) => {
    pendingRunRef.current = runId;
    setIsChecking(true);
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
            column: d.column,
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
      // Only clear "checking" if a newer run hasn't taken over as pending;
      // otherwise this stale completion would hide the newer run in flight.
      if (pendingRunRef.current === runId) {
        pendingRunRef.current = null;
        setIsChecking(false);
      }
    }
  };

  // Auto-check once edits pause for AUTO_RUN_DELAY; each change restarts the timer.
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
    const handle = setTimeout(() => check(runId), AUTO_RUN_DELAY);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, targetVersion, selectedCheckerIds, canRun, isReady]);

  return {
    field: { typecheckerDiagnostics },
    config: { isChecking, runSummary },
  };
}
