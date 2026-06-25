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
import { assignLanes, type PlacedSegment } from '@/squiggleLanes'

function seg(over: Partial<Segment>): Segment {
  return {
    line: 1,
    startColumn: 1,
    endColumn: 5,
    checker: 'mypy',
    checkerLabel: 'mypy',
    color: '#ff0000',
    severity: 'error',
    shape: 'wavy',
    message: 'boom',
    ...over,
  }
}

const laneOf = (placed: PlacedSegment[], startColumn: number) =>
  placed.find((p) => p.startColumn === startColumn)!.lane

describe('assignLanes', () => {
  it('puts a single finding in lane 1', () => {
    const placed = assignLanes([seg({})])
    expect(placed).toHaveLength(1)
    expect(placed[0].lane).toBe(1)
  })

  it('lets two non-overlapping findings share lane 1', () => {
    const placed = assignLanes([
      seg({ startColumn: 1, endColumn: 4 }),
      seg({ startColumn: 6, endColumn: 9, checker: 'pyright', color: '#00ff00' }),
    ])
    expect(placed.every((p) => p.lane === 1)).toBe(true)
  })

  it('keeps the wider finding in lane 1 and stacks the contained one below', () => {
    const placed = assignLanes([
      seg({ startColumn: 4, endColumn: 6, checker: 'mypy', color: '#ff0000' }),
      seg({ startColumn: 1, endColumn: 10, checker: 'pyright', color: '#00ff00' }),
    ])
    expect(laneOf(placed, 1)).toBe(1) // pyright 1-10 (wider) hugs the text
    expect(laneOf(placed, 4)).toBe(2) // mypy 4-6 below
  })

  it('breaks an identical-span tie by checker id, deterministically', () => {
    const placed = assignLanes([
      seg({ startColumn: 2, endColumn: 5, checker: 'pyright', color: '#00ff00' }),
      seg({ startColumn: 2, endColumn: 5, checker: 'mypy', color: '#ff0000' }),
    ])
    expect(placed.find((p) => p.color === '#ff0000')!.lane).toBe(1) // mypy < pyright
    expect(placed.find((p) => p.color === '#00ff00')!.lane).toBe(2)
  })

  it('stacks an error over a warning of the same checker (different shape)', () => {
    const placed = assignLanes([
      seg({ startColumn: 2, endColumn: 5, severity: 'warning', shape: 'dotted' }),
      seg({ startColumn: 1, endColumn: 10, severity: 'error', shape: 'wavy' }),
    ])
    expect(laneOf(placed, 1)).toBe(1) // wider error
    expect(laneOf(placed, 2)).toBe(2) // narrower warning
  })

  it('dedups identical segments into one lane with one hover block each', () => {
    const placed = assignLanes([
      seg({ startColumn: 2, endColumn: 5, message: 'first error' }),
      seg({ startColumn: 2, endColumn: 5, message: 'second error' }),
    ])
    expect(placed).toHaveLength(1)
    expect(placed[0].lane).toBe(1)
    expect(placed[0].hovers.map((h) => h.message)).toEqual(['first error', 'second error'])
  })

  it('assigns lanes beyond 4 when many findings overlap', () => {
    const checkers = ['a', 'b', 'c', 'd', 'e']
    const placed = assignLanes(
      checkers.map((c, i) =>
        seg({ startColumn: 1, endColumn: 10, checker: c, color: `#${i}${i}${i}`, message: c }),
      ),
    )
    expect([...placed.map((p) => p.lane)].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('is deterministic regardless of input order', () => {
    const a = seg({ startColumn: 4, endColumn: 6, checker: 'mypy', color: '#ff0000' })
    const b = seg({ startColumn: 1, endColumn: 10, checker: 'pyright', color: '#00ff00' })
    const forward = assignLanes([a, b])
    const reversed = assignLanes([b, a])
    expect(laneOf(forward, 1)).toBe(laneOf(reversed, 1))
    expect(laneOf(forward, 4)).toBe(laneOf(reversed, 4))
  })
})
