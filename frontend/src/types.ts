// Raw diagnostic shape returned by the Ruff WASM Workspace.check() (start_location /
// end_location, 1-indexed rows).
export type { Diagnostic as RuffDiagnostic } from '@astral-sh/ruff-wasm-web';

export interface CheckerInfo {
  id: string;
  checker: string;
  version: string;
  label: string;
  color: string;
}

export type Severity = 'error' | 'warning' | 'information';

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
  checker: string;
  version: string;
  returncode: number | null;
  diagnostics: CheckerDiagnostic[];
  raw_stdout: string;
  raw_stderr: string;
  error: string | null;
  duration: number;
}

export interface EditorDiagnostic {
  file: string;
  checker: string;
  checkerLabel: string;
  color: string;
  line: number;
  character: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: Severity;
}
