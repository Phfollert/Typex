// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCheckerDiagnostics } from '@/hooks/useCheckerDiagnostics';
import type { CheckerInfo } from '@/types';

const CHECKERS: CheckerInfo[] = [{ id: 'c1', label: 'C1', color: '#f00' }];

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
});
