import { describe, it, expect } from 'vitest'
import { expandToSegments, type Segment } from '@/squiggleLanes'
import type { EditorDiagnostic } from '@/types'

function diag(over: Partial<EditorDiagnostic>): EditorDiagnostic {
  return {
    file: 'a.py',
    checker: 'mypy',
    checkerLabel: 'mypy',
    color: '#ff0000',
    line: 1,
    character: 1,
    endLine: 1,
    endColumn: 5,
    message: 'boom',
    severity: 'error',
    ...over,
  }
}

// Pretend every line is 21 columns wide (maxColumn 21).
const lineEnd = () => 21

describe('expandToSegments', () => {
  it('keeps a single-line finding as one segment with its own columns', () => {
    const segs = expandToSegments([diag({ line: 2, character: 3, endLine: 2, endColumn: 9 })], lineEnd)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ line: 2, startColumn: 3, endColumn: 9, checker: 'mypy', shape: 'wavy' })
  })

  it('expands a multi-line finding into one segment per crossed line', () => {
    const segs = expandToSegments(
      [diag({ line: 2, character: 5, endLine: 4, endColumn: 7 })],
      lineEnd,
    )
    const byLine = (l: number) => segs.find((s: Segment) => s.line === l)
    expect(segs).toHaveLength(3)
    expect(byLine(2)).toMatchObject({ startColumn: 5, endColumn: 21 }) // start col -> end of line
    expect(byLine(3)).toMatchObject({ startColumn: 1, endColumn: 21 }) // full middle line
    expect(byLine(4)).toMatchObject({ startColumn: 1, endColumn: 7 })  // line start -> end col
  })

  it('derives shape from severity', () => {
    const segs = expandToSegments(
      [
        diag({ line: 1, severity: 'error' }),
        diag({ line: 2, severity: 'warning' }),
        diag({ line: 3, severity: 'information' }),
      ],
      lineEnd,
    )
    expect(segs.map((s) => s.shape)).toEqual(['wavy', 'dotted', 'faint'])
  })
})
