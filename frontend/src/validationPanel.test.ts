import { describe, it, expect } from 'vitest';
import {
  badgeState,
  badgeTooltip,
  groupByFile,
  visibleDiagnostics,
  enterChecking,
  tabView,
} from '@/validationPanel';
import type { CheckerRunState, EditorDiagnostic } from '@/types';

function diag(over: Partial<EditorDiagnostic> = {}): EditorDiagnostic {
  return {
    file: 'a.py',
    checkerLabel: 'C1',
    color: '#f00',
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 2,
    message: 'boom',
    severity: 'error',
    ...over,
  };
}

describe('badgeState', () => {
  it('is idle when there is no state, checking when running', () => {
    expect(badgeState(undefined)).toEqual({ kind: 'idle' });
    expect(badgeState({ status: 'checking', prev: null })).toEqual({ kind: 'checking' });
  });

  it('is clean when done with no non-information diagnostics', () => {
    expect(badgeState({ status: 'done', diagnostics: [] })).toEqual({ kind: 'clean' });
    expect(
      badgeState({ status: 'done', diagnostics: [diag({ severity: 'information' })] })
    ).toEqual({ kind: 'clean' });
  });

  it('counts only non-information diagnostics', () => {
    const diagnostics = [diag(), diag({ severity: 'warning' }), diag({ severity: 'information' })];
    expect(badgeState({ status: 'done', diagnostics })).toEqual({ kind: 'count', count: 2 });
  });

  it('is error when failed', () => {
    expect(badgeState({ status: 'error', message: 'HTTP 500', prev: null })).toEqual({
      kind: 'error',
      message: 'HTTP 500',
    });
  });
});

describe('badgeTooltip', () => {
  it('describes each badge state', () => {
    expect(badgeTooltip({ kind: 'idle' })).toBe('');
    expect(badgeTooltip({ kind: 'checking' })).toBe('Running…');
    expect(badgeTooltip({ kind: 'clean' })).toBe('No issues');
    expect(badgeTooltip({ kind: 'count', count: 1 })).toBe('1 issue found');
    expect(badgeTooltip({ kind: 'count', count: 3 })).toBe('3 issues found');
    expect(badgeTooltip({ kind: 'error', message: 'HTTP 500' })).toBe('HTTP 500');
  });
});

describe('groupByFile', () => {
  it('groups diagnostics by file preserving first-seen order', () => {
    const groups = groupByFile([diag({ file: 'b.py' }), diag({ file: 'a.py' }), diag({ file: 'b.py' })]);
    expect(groups.map((g) => g.file)).toEqual(['b.py', 'a.py']);
    expect(groups[0].diagnostics).toHaveLength(2);
  });
});

describe('visibleDiagnostics', () => {
  it('returns done diagnostics, else prev, else empty', () => {
    expect(visibleDiagnostics(undefined)).toEqual([]);
    const d = [diag()];
    expect(visibleDiagnostics({ status: 'done', diagnostics: d })).toBe(d);
    expect(visibleDiagnostics({ status: 'checking', prev: d })).toBe(d);
    expect(visibleDiagnostics({ status: 'checking', prev: null })).toEqual([]);
    expect(visibleDiagnostics({ status: 'error', message: 'x', prev: d })).toBe(d);
  });
});

describe('enterChecking', () => {
  it('moves selected ids to checking, carrying visible diagnostics as prev', () => {
    const prev: Record<string, CheckerRunState> = {
      c1: { status: 'done', diagnostics: [diag()] },
      c2: { status: 'done', diagnostics: [] },
      dropped: { status: 'done', diagnostics: [diag()] },
    };
    const next = enterChecking(prev, ['c1', 'c2']);
    expect(Object.keys(next)).toEqual(['c1', 'c2']);
    expect(next.c1).toEqual({ status: 'checking', prev: prev.c1.status === 'done' ? prev.c1.diagnostics : null });
    expect(next.c2).toEqual({ status: 'checking', prev: null });
  });
});

describe('tabView', () => {
  it('shows done diagnostics, not dimmed', () => {
    const view = tabView({ status: 'done', diagnostics: [diag()] });
    expect(view).toEqual({ dimmed: false, error: null, groups: groupByFile([diag()]) });
  });

  it('shows prev dimmed while checking', () => {
    const view = tabView({ status: 'checking', prev: [diag()] });
    expect(view.dimmed).toBe(true);
    expect(view.error).toBeNull();
    expect(view.groups).toHaveLength(1);
  });

  it('carries the error message and keeps prev', () => {
    const view = tabView({ status: 'error', message: 'HTTP 500', prev: [diag()] });
    expect(view.error).toBe('HTTP 500');
    expect(view.dimmed).toBe(true);
    expect(view.groups).toHaveLength(1);
  });
});
