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

  it('gives the wider checker the higher lane (CSS renders it nearer the text)', () => {
    const placed = assignLanes([
      seg({ startColumn: 4, endColumn: 6, checker: 'mypy', color: '#ff0000' }),
      seg({ startColumn: 1, endColumn: 10, checker: 'pyright', color: '#00ff00' }),
    ])
    expect(laneOf(placed, 1)).toBe(2) // pyright 1-10 (wider) -> higher lane, nearer text
    expect(laneOf(placed, 4)).toBe(1) // mypy 4-6 (narrower) -> lower lane, below
  })

  it('breaks an identical-span tie by checker id, deterministically', () => {
    const placed = assignLanes([
      seg({ startColumn: 2, endColumn: 5, checker: 'pyright', color: '#00ff00' }),
      seg({ startColumn: 2, endColumn: 5, checker: 'mypy', color: '#ff0000' }),
    ])
    expect(placed.find((p) => p.color === '#ff0000')!.lane).toBe(1) // mypy < pyright
    expect(placed.find((p) => p.color === '#00ff00')!.lane).toBe(2)
  })

  it('keeps one checker on a single lane and draws it with the most-severe shape', () => {
    const placed = assignLanes([
      seg({ startColumn: 2, endColumn: 5, severity: 'warning', shape: 'dotted', message: 'warn' }),
      seg({ startColumn: 1, endColumn: 10, severity: 'error', shape: 'wavy', message: 'err' }),
    ])
    // Same checker (mypy) -> one lane; its own findings don't stack against each other.
    expect(placed.every((p) => p.lane === 1)).toBe(true)
    // Most severe (error -> wavy) wins for the whole checker, so both segments share one shape.
    expect(placed.every((p) => p.shape === 'wavy')).toBe(true)
    // Both findings remain reachable on hover.
    const messages = placed.flatMap((p) => p.hovers.map((h) => h.message)).sort()
    expect(messages).toEqual(['err', 'warn'])
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

  it('puts a wide whole-line checker nearer the text than a narrow overlapping one', () => {
    const placed = assignLanes([
      seg({ startColumn: 5, endColumn: 35, checker: 'mypy', color: '#ef4444' }),
      seg({ startColumn: 21, endColumn: 25, checker: 'pyright', color: '#3b82f6' }),
    ])
    const mypyLane = placed.find((p) => p.color === '#ef4444')!.lane
    const pyrightLane = placed.find((p) => p.color === '#3b82f6')!.lane
    expect(mypyLane).toBeGreaterThan(pyrightLane)
  })

  it('collapses a checker with multiple findings to one lane and bounds lanes by checker count', () => {
    const placed = assignLanes([
      seg({ startColumn: 1, endColumn: 20, checker: 'mypy', color: '#ef4444' }),
      seg({ startColumn: 16, endColumn: 20, checker: 'mypy', color: '#ef4444' }),
      seg({ startColumn: 16, endColumn: 20, checker: 'pyright', color: '#3b82f6' }),
      seg({ startColumn: 16, endColumn: 20, checker: 'ty', color: '#10b981' }),
      seg({ startColumn: 16, endColumn: 20, checker: 'pyrefly', color: '#f59e0b' }),
    ])
    const mypyLanes = [...new Set(placed.filter((p) => p.color === '#ef4444').map((p) => p.lane))]
    expect(mypyLanes).toHaveLength(1) // mypy's two findings share one lane
    const maxLane = Math.max(...placed.map((p) => p.lane))
    expect(maxLane).toBe(4) // 4 distinct checkers -> 4 lanes
    expect(mypyLanes[0]).toBe(maxLane) // widest checker (mypy) is nearest the text
  })
})
import { layoutSquiggles } from '@/squiggleLanes'

describe('layoutSquiggles', () => {
  it('lays out across lines and reports the global max lane', () => {
    const { placements, maxLane } = layoutSquiggles(
      [
        diag({ line: 1, character: 1, endLine: 1, endColumn: 10, checker: 'pyright', color: '#00ff00' }),
        diag({ line: 1, character: 4, endLine: 1, endColumn: 6, checker: 'mypy', color: '#ff0000' }),
        diag({ line: 2, character: 1, endLine: 2, endColumn: 5, checker: 'mypy', color: '#ff0000' }),
      ],
      () => 21,
    )
    expect(maxLane).toBe(2) // line 1 stacks two; line 2 has one
    expect(placements.filter((p) => p.line === 1)).toHaveLength(2)
    expect(placements.filter((p) => p.line === 2)).toHaveLength(1)
    expect(placements.find((p) => p.line === 2)!.lane).toBe(1)
  })

  it('returns maxLane 0 for no diagnostics', () => {
    const { placements, maxLane } = layoutSquiggles([], () => 21)
    expect(placements).toEqual([])
    expect(maxLane).toBe(0)
  })
})
