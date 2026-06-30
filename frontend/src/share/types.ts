// Serializable workspace state carried by share links and browser persistence.
// Diagnostics are never stored; they are recomputed on load.

export interface ShareState {
  v: 1; // payload schema version; the discriminant loadShareState() switches on
  files: Record<string, string>;
  panes: string[];
  checkers: string[];
  py: string; // Ruff target form, e.g. "py312"
}

export const CURRENT_SHARE_VERSION = 1;

// Migrate a decoded payload to the current ShareState by its `v`, or return null
// if it is not a shape we recognize.
export function loadShareState(raw: unknown): ShareState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  switch (obj.v) {
    case 1:
      return isValidState(obj) ? (obj as unknown as ShareState) : null;
    default:
      return null;
  }
}

function isValidState(obj: Record<string, unknown>): boolean {
  if (typeof obj.py !== 'string') return false;
  if (!isStringRecord(obj.files)) return false;
  if (!isStringArray(obj.panes)) return false;
  if (!isStringArray(obj.checkers)) return false;
  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}
