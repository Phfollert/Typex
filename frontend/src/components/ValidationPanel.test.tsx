// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import ValidationPanel from '@/components/ValidationPanel';
import type { CheckerInfo, CheckerRunState, EditorDiagnostic } from '@/types';

const CHECKERS: CheckerInfo[] = [
  { id: 'c1', label: 'C1', color: '#f00' },
  { id: 'c2', label: 'C2', color: '#0f0' },
];

function diag(over: Partial<EditorDiagnostic> = {}): EditorDiagnostic {
  return {
    file: 'a.py',
    checkerLabel: 'C1',
    color: '#f00',
    line: 12,
    column: 8,
    endLine: 12,
    endColumn: 9,
    message: 'bad return type',
    severity: 'error',
    ...over,
  };
}

describe('ValidationPanel', () => {
  it('renders one tab per selected checker with its badge', () => {
    const states: Record<string, CheckerRunState> = {
      c1: { status: 'done', diagnostics: [diag()] },
      c2: { status: 'checking', prev: null },
    };
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1', 'c2']} checkerStates={states} />);

    expect(screen.getByText('C1')).toBeTruthy();
    expect(screen.getByText('C2')).toBeTruthy();
    // c1 count badge with tooltip; c2 spinner with tooltip.
    expect(screen.getByTitle('1 issue found')).toBeTruthy();
    expect(screen.getByTitle('Running…')).toBeTruthy();
  });

  it('shows a check for a clean checker and a cross for a failed one', () => {
    const states: Record<string, CheckerRunState> = {
      c1: { status: 'done', diagnostics: [] },
      c2: { status: 'error', message: 'HTTP 500', prev: null },
    };
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1', 'c2']} checkerStates={states} />);
    expect(screen.getByTitle('No issues')).toBeTruthy();
    expect(screen.getByTitle('HTTP 500')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
  });

  it('shows the active checker content grouped by file and switches on tab click', () => {
    const states: Record<string, CheckerRunState> = {
      c1: { status: 'done', diagnostics: [diag({ message: 'from c1' })] },
      c2: { status: 'done', diagnostics: [diag({ message: 'from c2', file: 'b.py' })] },
    };
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1', 'c2']} checkerStates={states} />);

    // Default active tab is the first selected checker.
    expect(screen.getByText('from c1')).toBeTruthy();
    expect(screen.queryByText('from c2')).toBeNull();

    fireEvent.click(screen.getByText('C2'));
    expect(screen.getByText('from c2')).toBeTruthy();
    expect(screen.getByText('b.py')).toBeTruthy();
  });

  it('falls back to the first checker when the active one is deselected', () => {
    const states: Record<string, CheckerRunState> = {
      c1: { status: 'done', diagnostics: [diag({ message: 'from c1' })] },
      c2: { status: 'done', diagnostics: [diag({ message: 'from c2' })] },
    };
    const { rerender } = render(
      <ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1', 'c2']} checkerStates={states} />
    );
    fireEvent.click(screen.getByText('C2'));
    expect(screen.getByText('from c2')).toBeTruthy();

    // c2 removed from selection: content falls back to c1.
    rerender(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1']} checkerStates={states} />);
    expect(screen.getByText('from c1')).toBeTruthy();
    expect(screen.queryByText('C2')).toBeNull();
  });

  it('renders a checker with no state as a blank tab (no badge, no content)', () => {
    // Cleared panel (e.g. invalid syntax): tabs remain, but no badge or results.
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1']} checkerStates={{}} />);
    expect(screen.getByText('C1')).toBeTruthy();
    expect(screen.queryByTitle('Running…')).toBeNull();
    expect(screen.queryByText('No issues')).toBeNull();
    expect(screen.queryByText('bad return type')).toBeNull();
  });

  it('shows an empty state when no checkers are selected', () => {
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={[]} checkerStates={{}} />);
    expect(screen.getByText('No checkers selected')).toBeTruthy();
  });

  it('hides the content when collapsed', () => {
    const states: Record<string, CheckerRunState> = { c1: { status: 'done', diagnostics: [diag()] } };
    render(<ValidationPanel checkers={CHECKERS} selectedCheckerIds={['c1']} checkerStates={states} />);
    expect(screen.getByText('bad return type')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(screen.queryByText('bad return type')).toBeNull();
  });
});
