import type { CheckerRunState, EditorDiagnostic } from '@/types';

export type BadgeState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'count'; count: number }
  | { kind: 'clean' }
  | { kind: 'error'; message: string };

// No state means the checker has not run (e.g. cleared because syntax is invalid):
// an idle badge, distinct from the spinner shown while a run is in flight.
export function badgeState(state: CheckerRunState | undefined): BadgeState {
  if (!state) return { kind: 'idle' };
  if (state.status === 'checking') return { kind: 'checking' };
  if (state.status === 'error') return { kind: 'error', message: state.message };
  const count = state.diagnostics.filter((d) => d.severity !== 'information').length;
  return count === 0 ? { kind: 'clean' } : { kind: 'count', count };
}

export function badgeTooltip(b: BadgeState): string {
  switch (b.kind) {
    case 'idle':
      return '';
    case 'checking':
      return 'Running…';
    case 'clean':
      return 'No issues';
    case 'count':
      return `${b.count} issue${b.count === 1 ? '' : 's'} found`;
    case 'error':
      return b.message;
  }
}

export interface FileGroup {
  file: string;
  diagnostics: EditorDiagnostic[];
}

export function groupByFile(diagnostics: EditorDiagnostic[]): FileGroup[] {
  const byFile = new Map<string, EditorDiagnostic[]>();
  for (const d of diagnostics) {
    const list = byFile.get(d.file);
    if (list) list.push(d);
    else byFile.set(d.file, [d]);
  }
  return [...byFile.entries()].map(([file, diags]) => ({ file, diagnostics: diags }));
}

// The diagnostics currently shown for a checker: fresh when done, otherwise the
// previous set retained for the dimmed view.
export function visibleDiagnostics(state: CheckerRunState | undefined): EditorDiagnostic[] {
  if (!state) return [];
  if (state.status === 'done') return state.diagnostics;
  return state.prev ?? [];
}

// Move every selected checker into `checking`, carrying its currently-visible
// diagnostics as `prev` so the panel dims them until the checker responds again.
export function enterChecking(
  prev: Record<string, CheckerRunState>,
  ids: string[],
): Record<string, CheckerRunState> {
  const next: Record<string, CheckerRunState> = {};
  for (const id of ids) {
    const carried = visibleDiagnostics(prev[id]);
    next[id] = { status: 'checking', prev: carried.length ? carried : null };
  }
  return next;
}

export interface TabView {
  dimmed: boolean;
  error: string | null;
  groups: FileGroup[];
}

export function tabView(state: CheckerRunState | undefined): TabView {
  if (!state) return { dimmed: true, error: null, groups: [] };
  if (state.status === 'done') {
    return { dimmed: false, error: null, groups: groupByFile(state.diagnostics) };
  }
  const error = state.status === 'error' ? state.message : null;
  return { dimmed: state.prev != null, error, groups: groupByFile(state.prev ?? []) };
}
