import { useState, useEffect, useRef } from 'react';
import type { CheckerInfo, CheckerResult, CheckerRunState, EditorDiagnostic } from '@/types';
import { enterChecking, visibleDiagnostics } from '@/validationPanel';

const AUTO_RUN_DELAY = 800; // ms of inactivity before auto-checking

// Ruff target ("py312") -> backend python_version ("3.12")
function ruffToPythonVersion(target: string): string {
  const digits = target.replace('py', '');
  return `${digits[0]}.${digits.slice(1)}`;
}

function toEditorDiagnostics(result: CheckerResult, info: CheckerInfo): EditorDiagnostic[] {
  return result.diagnostics.map((d) => ({
    file: d.file,
    checkerLabel: info.label,
    color: info.color,
    line: d.line,
    column: d.column,
    endLine: d.end_line,
    endColumn: d.end_column,
    message: d.code ? `${d.message} (${d.code})` : d.message,
    severity: d.severity,
  }));
}

interface UseCheckerDiagnosticsArgs {
  files: Record<string, string>;
  targetVersion: string;
  isReady: boolean;
  canRun: boolean;
  checkers: CheckerInfo[];
  selectedCheckerIds: string[];
}

// Runs the selected checkers and exposes two independently-updated slices:
// `checkerStates` (per-checker, updated as each response lands, drives the panel)
// and `typecheckerDiagnostics` (the flat squiggle array, updated once per run at
// the all-settled barrier so the squiggle lane algorithm sees the full set).
export function useCheckerDiagnostics({
  files,
  targetVersion,
  isReady,
  canRun,
  checkers,
  selectedCheckerIds,
}: UseCheckerDiagnosticsArgs) {
  const [checkerStates, setCheckerStates] = useState<Record<string, CheckerRunState>>({});
  const [typecheckerDiagnostics, setTypecheckerDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  // Latest issued run id; any edit bumps it, invalidating in-flight runs.
  const runIdRef = useRef(0);

  const logError = (msg: string) => {
    console.error(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  const check = async (runId: number) => {
    const pythonVersion = ruffToPythonVersion(targetVersion);
    const checkerById = new Map(checkers.map((c) => [c.id, c]));

    const requests = selectedCheckerIds.map((id) =>
      fetch(`/api/checkers/${id}/typecheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, python_version: pythonVersion }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<CheckerResult>;
        })
        .then((result) => {
          const info = checkerById.get(id);
          const diags = info ? toEditorDiagnostics(result, info) : [];
          if (runId === runIdRef.current) {
            setCheckerStates((s) => ({ ...s, [id]: { status: 'done', diagnostics: diags } }));
          }
          return diags;
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          logError(`[${id}] request failed: ${message}`);
          if (runId === runIdRef.current) {
            setCheckerStates((s) => {
              const prev = visibleDiagnostics(s[id]);
              return { ...s, [id]: { status: 'error', message, prev: prev.length ? prev : null } };
            });
          }
          throw err;
        })
    );

    const settled = await Promise.allSettled(requests);
    // A newer run (or edit) started while this one was in flight; drop stale results.
    if (runId !== runIdRef.current) return;

    const flat: EditorDiagnostic[] = [];
    let checkersWithIssues = 0;
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      flat.push(...outcome.value);
      if (outcome.value.some((d) => d.severity !== 'information')) checkersWithIssues++;
    }
    setTypecheckerDiagnostics(flat);
    setRunSummary(
      checkersWithIssues > 0
        ? `${checkersWithIssues} typechecker${checkersWithIssues === 1 ? '' : 's'} found issues`
        : 'No issues found'
    );
  };

  // Depend on stable primitives, not object/array identity, so the effect (which
  // now sets state synchronously) fires on real changes rather than every render.
  // checkersKey is included because `check` reads `checkers` for labels/colors.
  const filesKey = JSON.stringify(files);
  const idsKey = selectedCheckerIds.join(' ');
  const checkersKey = checkers.map((c) => c.id).join(' ');

  // Auto-check once edits pause for AUTO_RUN_DELAY; each change restarts the timer.
  // When a run starts, squiggles clear and the panel shows dimmed prev + spinner.
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (!isReady) return;
    // Nothing selected: clear both slices instead of leaving the last run on screen.
    if (selectedCheckerIds.length === 0) {
      setCheckerStates({});
      setTypecheckerDiagnostics([]);
      setRunSummary(null);
      return;
    }
    // Ruff is not clean (syntax invalid), so the typecheckers cannot run. Clear
    // both slices: the typechecker squiggles disappear (Ruff's own squiggles are
    // a separate slice and stay) and the panel clears rather than showing stale
    // counts. A later clean run repopulates them.
    if (!canRun) {
      setCheckerStates({});
      setTypecheckerDiagnostics([]);
      setRunSummary(null);
      return;
    }
    setTypecheckerDiagnostics([]);
    setCheckerStates((prev) => enterChecking(prev, selectedCheckerIds));
    const handle = setTimeout(() => check(runId), AUTO_RUN_DELAY);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, targetVersion, idsKey, checkersKey, canRun, isReady]);

  const isChecking = Object.values(checkerStates).some((s) => s.status === 'checking');

  return {
    field: { checkerStates, typecheckerDiagnostics },
    config: { isChecking, runSummary },
  };
}
