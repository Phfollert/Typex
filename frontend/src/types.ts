// Raw diagnostic shape returned by the Ruff WASM Workspace.check() (start_location /
// end_location, 1-indexed rows).
export type { Diagnostic as RuffDiagnostic } from '@astral-sh/ruff-wasm-web';

export interface CheckerInfo {
  id: string;
  label: string;
  color: string;
}

export type Severity = 'error' | 'warning' | 'information';

export type SquiggleShape = 'wavy' | 'dotted' | 'faint';

export interface CheckerDiagnostic {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: Severity;
  message: string;
  code: string | null;
}

export interface CheckerResult {
  diagnostics: CheckerDiagnostic[];
}

export interface EditorDiagnostic {
  file: string;
  checkerLabel: string;
  color: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: Severity;
}

export type CheckerRunState =
  | { status: 'checking'; prev: EditorDiagnostic[] | null }
  | { status: 'done'; diagnostics: EditorDiagnostic[] }
  | { status: 'error'; message: string; prev: EditorDiagnostic[] | null };
