// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCheckerDiagnostics } from '@/hooks/useCheckerDiagnostics';
import type { CheckerInfo } from '@/types';

const CHECKERS: CheckerInfo[] = [{ id: 'c1', label: 'C1', color: '#f00' }];

const TWO_CHECKERS: CheckerInfo[] = [
  { id: 'c1', label: 'C1', color: '#f00' },
  { id: 'c2', label: 'C2', color: '#0f0' },
];

// Resolvers for the typecheck POSTs, in call order. Each run's request stays
// pending until the test completes it, so the test picks the finish order.
let pendingRuns: Array<(message: string) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  pendingRuns = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((resolve) => {
          pendingRuns.push((message) =>
            resolve({
              ok: true,
              json: async () => ({
                diagnostics: [
                  { file: 'a.py', line: 1, column: 1, end_line: 1, end_column: 2, severity: 'error', message, code: null },
                ],
              }),
            })
          );
        })
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCheckerDiagnostics', () => {
  it('a stale run finishing first neither commits results nor clears "checking" under the newer run', async () => {
    const { result, rerender } = renderHook(
      ({ files }: { files: Record<string, string> }) =>
        useCheckerDiagnostics({
          files,
          targetVersion: 'py312',
          isReady: true,
          canRun: true,
          checkers: CHECKERS,
          selectedCheckerIds: ['c1'],
        }),
      { initialProps: { files: { 'a.py': 'A' } } }
    );

    // Let the debounce elapse so run A starts.
    await act(async () => vi.runAllTimersAsync());
    expect(pendingRuns).toHaveLength(1);
    expect(result.current.config.isChecking).toBe(true);

    // An edit starts run B while A is still in flight.
    rerender({ files: { 'a.py': 'B' } });
    await act(async () => vi.runAllTimersAsync());
    expect(pendingRuns).toHaveLength(2);

    // Stale run A finishes first: results dropped, flag still held by run B.
    await act(async () => pendingRuns[0]('A'));
    expect(result.current.config.isChecking).toBe(true);
    expect(result.current.field.typecheckerDiagnostics).toEqual([]);

    // Run B finishes: its results commit and the flag clears.
    await act(async () => pendingRuns[1]('B'));
    expect(result.current.config.isChecking).toBe(false);
    expect(result.current.field.typecheckerDiagnostics.map((d) => d.message)).toEqual(['B']);
  });

  it('a checker reaches done as soon as it responds, before the others settle', async () => {
    const { result } = renderHook(() =>
      useCheckerDiagnostics({
        files: { 'a.py': 'A' },
        targetVersion: 'py312',
        isReady: true,
        canRun: true,
        checkers: TWO_CHECKERS,
        selectedCheckerIds: ['c1', 'c2'],
      })
    );

    await act(async () => vi.runAllTimersAsync());
    expect(pendingRuns).toHaveLength(2); // one request per checker

    // Only c1 responds.
    await act(async () => pendingRuns[0]('one'));
    expect(result.current.field.checkerStates.c1.status).toBe('done');
    expect(result.current.field.checkerStates.c2.status).toBe('checking');
    // Squiggles still empty: the barrier has not fired.
    expect(result.current.field.typecheckerDiagnostics).toEqual([]);

    // c2 responds: both done, squiggles now hold both.
    await act(async () => pendingRuns[1]('two'));
    expect(result.current.field.checkerStates.c2.status).toBe('done');
    expect(result.current.field.typecheckerDiagnostics.map((d) => d.message).sort()).toEqual([
      'one',
      'two',
    ]);
    expect(result.current.config.isChecking).toBe(false);
  });

  it('a rejected request puts that checker in the error state', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => Promise.resolve({ ok: false, status: 500 })
    );

    const { result } = renderHook(() =>
      useCheckerDiagnostics({
        files: { 'a.py': 'A' },
        targetVersion: 'py312',
        isReady: true,
        canRun: true,
        checkers: CHECKERS,
        selectedCheckerIds: ['c1'],
      })
    );

    await act(async () => vi.runAllTimersAsync());
    expect(result.current.field.checkerStates.c1.status).toBe('error');
    if (result.current.field.checkerStates.c1.status === 'error') {
      expect(result.current.field.checkerStates.c1.message).toContain('500');
    }
  });

  it('a re-run keeps the previous results as dimmed prev until the checker responds', async () => {
    const { result, rerender } = renderHook(
      ({ files }: { files: Record<string, string> }) =>
        useCheckerDiagnostics({
          files,
          targetVersion: 'py312',
          isReady: true,
          canRun: true,
          checkers: CHECKERS,
          selectedCheckerIds: ['c1'],
        }),
      { initialProps: { files: { 'a.py': 'A' } } }
    );

    await act(async () => vi.runAllTimersAsync());
    await act(async () => pendingRuns[0]('first'));
    expect(result.current.field.checkerStates.c1.status).toBe('done');

    // Edit triggers a re-run: c1 goes back to checking, carrying prev.
    rerender({ files: { 'a.py': 'B' } });
    const state = result.current.field.checkerStates.c1;
    expect(state.status).toBe('checking');
    if (state.status === 'checking') {
      expect(state.prev?.map((d) => d.message)).toEqual(['first']);
    }
  });

  it('clears both slices when the syntax is invalid (canRun false)', async () => {
    const { result, rerender } = renderHook(
      ({ canRun, files }: { canRun: boolean; files: Record<string, string> }) =>
        useCheckerDiagnostics({
          files,
          targetVersion: 'py312',
          isReady: true,
          canRun,
          checkers: CHECKERS,
          selectedCheckerIds: ['c1'],
        }),
      { initialProps: { canRun: true, files: { 'a.py': 'A' } } }
    );

    await act(async () => vi.runAllTimersAsync());
    await act(async () => pendingRuns[0]('done'));
    expect(result.current.field.checkerStates.c1.status).toBe('done');
    expect(result.current.field.typecheckerDiagnostics.map((d) => d.message)).toEqual(['done']);

    // An edit breaks the syntax: canRun flips false. Both slices clear so the
    // typechecker squiggles and the panel go away (Ruff squiggles are separate).
    rerender({ canRun: false, files: { 'a.py': 'A syntax(' } });
    expect(result.current.field.checkerStates).toEqual({});
    expect(result.current.field.typecheckerDiagnostics).toEqual([]);
  });
});
