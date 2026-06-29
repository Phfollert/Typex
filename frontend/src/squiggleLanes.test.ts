import { describe, it, expect } from 'vitest'
import { expandToSegments, layoutSquiggles, type Segment, type PlacedSegment } from '@/squiggleLanes'
import type { EditorDiagnostic } from '@/types'

function diag(over: Partial<EditorDiagnostic>): EditorDiagnostic {
  return {
    file: 'a.py',
    checkerLabel: 'mypy',
    color: '#ff0000',
    line: 1,
    column: 1,
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
    const segs = expandToSegments([diag({ line: 2, column: 3, endLine: 2, endColumn: 9 })], lineEnd)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ line: 2, startColumn: 3, endColumn: 9, checkerLabel: 'mypy', shape: 'wavy' })
  })

  it('expands a multi-line finding into one segment per crossed line', () => {
    const segs = expandToSegments(
      [diag({ line: 2, column: 5, endLine: 4, endColumn: 7 })],
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

const laneByColor = (placements: PlacedSegment[], color: string) =>
  placements.find((p) => p.color === color)!.lane

// The span rendered at a given column (half-open ranges), as Monaco hovers it.
const spanAt = (placements: PlacedSegment[], column: number) =>
  placements.find((p) => p.startColumn <= column && column < p.endColumn)!

const messagesAt = (placements: PlacedSegment[], column: number) =>
  spanAt(placements, column).hovers.map((h) => h.message).sort()

describe('layoutSquiggles', () => {
  it('returns maxLane 0 for no diagnostics', () => {
    const { placements, maxLane } = layoutSquiggles([], lineEnd)
    expect(placements).toEqual([])
    expect(maxLane).toBe(0)
  })

  it('puts a single finding in lane 1', () => {
    const { placements, maxLane } = layoutSquiggles([diag({})], lineEnd)
    expect(placements).toHaveLength(1)
    expect(placements[0].lane).toBe(1)
    expect(maxLane).toBe(1)
  })

  it('lets two non-overlapping checkers share lane 1', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 4, checkerLabel: 'mypy', color: '#ff0000' }),
        diag({ column: 6, endColumn: 9, checkerLabel: 'pyright', color: '#00ff00' }),
      ],
      lineEnd,
    )
    expect(placements.every((p) => p.lane === 1)).toBe(true)
  })

  it('greedily gives overlapping checkers the closest free lanes', () => {
    const { placements, maxLane } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 10, checkerLabel: 'mypy', color: '#ff0000' }),
        diag({ column: 1, endColumn: 10, checkerLabel: 'pyright', color: '#00ff00' }),
      ],
      lineEnd,
    )
    expect(maxLane).toBe(2)
    expect(laneByColor(placements, '#ff0000')).toBe(1) // equal start -> stable order by checker key
    expect(laneByColor(placements, '#00ff00')).toBe(2)
  })

  it('reuses a lower lane for a checker that clears the ones it overlaps', () => {
    // a: 1-5, b: 4-12 overlaps a, c: 11-15 overlaps b but not a.
    const { placements, maxLane } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 5, checkerLabel: 'a', color: '#aaaaaa' }),
        diag({ column: 4, endColumn: 12, checkerLabel: 'b', color: '#bbbbbb' }),
        diag({ column: 11, endColumn: 15, checkerLabel: 'c', color: '#cccccc' }),
      ],
      lineEnd,
    )
    expect(laneByColor(placements, '#aaaaaa')).toBe(1)
    expect(laneByColor(placements, '#bbbbbb')).toBe(2)
    expect(laneByColor(placements, '#cccccc')).toBe(1) // closest free lane, since it never meets a
    expect(maxLane).toBe(2)
  })

  it('masks a lower-severity finding fully covered by a higher one (one lane)', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 2, endColumn: 5, severity: 'warning', message: 'warn' }),
        diag({ column: 1, endColumn: 10, severity: 'error', message: 'err' }),
      ],
      lineEnd,
    )
    expect(placements.every((p) => p.lane === 1)).toBe(true)
    expect(placements.every((p) => p.shape === 'wavy')).toBe(true) // error covers all 1-10 -> all wavy
    expect(messagesAt(placements, 3)).toEqual(['err', 'warn']) // overlap shows both
    expect(messagesAt(placements, 7)).toEqual(['err']) // past the warning -> error only
  })

  // A higher severity masks a lower one only where they overlap; the lower one
  // still shows past the higher one's end. Same checker, so one lane, but the
  // shape changes by column.
  it('flattens overlapping findings by per-column severity', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 10, severity: 'error', message: 'err' }),
        diag({ column: 6, endColumn: 15, severity: 'warning', message: 'warn' }),
      ],
      () => 21,
    )
    expect(new Set(placements.map((p) => p.lane)).size).toBe(1) // same checker -> one lane
    // Shapes by column: error wins 1-10, warning shows past col 10.
    expect(spanAt(placements, 3).shape).toBe('wavy') // error only
    expect(spanAt(placements, 8).shape).toBe('wavy') // overlap -> error masks warning
    expect(spanAt(placements, 12).shape).toBe('dotted') // warning tail
  })

  // A column's hover lists only the findings whose range contains it, not others
  // sharing the same squiggle run.
  it('reports only the findings covering the hovered column', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 10, severity: 'error', message: 'err' }),
        diag({ column: 6, endColumn: 15, severity: 'warning', message: 'warn' }),
      ],
      () => 21,
    )
    expect(messagesAt(placements, 3)).toEqual(['err']) // error-only region: no warning leak
    expect(messagesAt(placements, 8)).toEqual(['err', 'warn']) // overlap region
    expect(messagesAt(placements, 12)).toEqual(['warn']) // warning-only region
  })

  it('dedups identical spans into one squiggle carrying every message', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 2, endColumn: 5, message: 'first error' }),
        diag({ column: 2, endColumn: 5, message: 'second error' }),
      ],
      lineEnd,
    )
    expect(placements).toHaveLength(1)
    expect(placements[0].lane).toBe(1)
    expect(placements[0].hovers.map((h) => h.message)).toEqual(['first error', 'second error'])
  })

  it('keeps a multi-line finding on one continuous lane down every row', () => {
    const { placements } = layoutSquiggles(
      [
        // mypy spans lines 1-3; pyright overlaps only on line 2.
        diag({ line: 1, column: 1, endLine: 3, endColumn: 5, checkerLabel: 'mypy', color: '#ff0000' }),
        diag({ line: 2, column: 1, endLine: 2, endColumn: 5, checkerLabel: 'pyright', color: '#00ff00' }),
      ],
      lineEnd,
    )
    const mypy = placements.filter((p) => p.color === '#ff0000')
    expect(mypy).toHaveLength(3)
    expect(new Set(mypy.map((p) => p.lane)).size).toBe(1) // one continuous lane on lines 1, 2 and 3
    // The finding starting on line 1 sits nearer the text (higher lane) than the
    // one starting on line 2, where they meet.
    expect(mypy[0].lane).toBeGreaterThan(laneByColor(placements, '#00ff00'))
  })

  // Ordering uses the document start, not the column on the overlap line. The
  // first finding begins on line 4 (col 15) and continues onto line 5 as a col-1
  // continuation; it must still sit nearer the text than one beginning fresh on
  // line 5 at col 1 (earlier column, but later line).
  it('orders by the document start even when a finding continues from a previous line', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ line: 4, column: 15, endLine: 5, endColumn: 6, checkerLabel: 'mypy', color: '#ef4444' }),
        diag({ line: 5, column: 1, endLine: 5, endColumn: 6, checkerLabel: 'pyright', color: '#3b82f6' }),
      ],
      () => 21,
    )
    const onLine5 = placements.filter((p) => p.line === 5)
    const mypy5 = onLine5.find((p) => p.color === '#ef4444')!
    const pyright5 = onLine5.find((p) => p.color === '#3b82f6')!
    expect(mypy5.lane).toBeGreaterThan(pyright5.lane) // earlier start -> nearer the text
    expect(new Set(placements.filter((p) => p.color === '#ef4444').map((p) => p.lane)).size).toBe(1)
  })

  it('reports the global max lane across lines and keeps a checker on its lane', () => {
    const { placements, maxLane } = layoutSquiggles(
      [
        diag({ line: 1, column: 1, endColumn: 10, checkerLabel: 'pyright', color: '#00ff00' }),
        diag({ line: 1, column: 4, endColumn: 6, checkerLabel: 'mypy', color: '#ff0000' }),
        diag({ line: 2, column: 1, endColumn: 5, checkerLabel: 'mypy', color: '#ff0000' }),
      ],
      lineEnd,
    )
    expect(maxLane).toBe(2) // line 1 stacks two; line 2 has one
    expect(placements.filter((p) => p.line === 1)).toHaveLength(2)
    expect(placements.filter((p) => p.line === 2)).toHaveLength(1)
    expect(placements.find((p) => p.line === 2)!.lane).toBe(1) // mypy keeps lane 1
  })

  it('grows lanes past 4 when many checkers overlap', () => {
    const { maxLane } = layoutSquiggles(
      ['a', 'b', 'c', 'd', 'e'].map((c, i) =>
        diag({ column: 1, endColumn: 10, checkerLabel: c, color: `#${i}${i}${i}${i}${i}${i}` }),
      ),
      lineEnd,
    )
    expect(maxLane).toBe(5)
  })

  it('is deterministic regardless of input order', () => {
    const a = diag({ column: 4, endColumn: 6, checkerLabel: 'mypy', color: '#ff0000' })
    const b = diag({ column: 1, endColumn: 10, checkerLabel: 'pyright', color: '#00ff00' })
    const forward = layoutSquiggles([a, b], lineEnd).placements
    const reversed = layoutSquiggles([b, a], lineEnd).placements
    expect(laneByColor(forward, '#ff0000')).toBe(laneByColor(reversed, '#ff0000'))
    expect(laneByColor(forward, '#00ff00')).toBe(laneByColor(reversed, '#00ff00'))
  })

  // Distinct selections (different versions or configs of a tool) carry distinct
  // labels. They must land on separate lanes, each keeping its own color, rather
  // than collide on one lane's single background slot.
  it('gives checkers with distinct labels separate lanes and keeps both colors', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ column: 1, endColumn: 10, checkerLabel: 'mypy 1.20', color: '#ef4444' }),
        diag({ column: 1, endColumn: 10, checkerLabel: 'mypy 1.10', color: '#a855f7' }),
      ],
      lineEnd,
    )
    expect(laneByColor(placements, '#ef4444')).not.toBe(laneByColor(placements, '#a855f7'))
    expect(new Set(placements.map((p) => p.color))).toEqual(new Set(['#ef4444', '#a855f7']))
  })

  // One checker spans a line from col 5 (into the next line); another flags only
  // later columns. The second must never render on a column it does not cover,
  // and must keep one continuous lane.
  it('keeps a checker off columns it never flags when another spans the whole line', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ line: 4, column: 5, endLine: 5, endColumn: 20, checkerLabel: 'mypy', color: '#ef4444' }),
        diag({ line: 4, column: 21, endLine: 4, endColumn: 25, checkerLabel: 'pyright', color: '#3b82f6' }),
        diag({ line: 4, column: 30, endLine: 4, endColumn: 34, checkerLabel: 'pyright', color: '#3b82f6' }),
      ],
      () => 34,
    )
    const pyright = placements.filter((p) => p.color === '#3b82f6')
    expect(pyright.every((p) => p.startColumn >= 21)).toBe(true) // never on a column it does not cover
    expect(new Set(pyright.map((p) => p.lane)).size).toBe(1) // one continuous lane
    // The spanning checker still owns the early column on its own lane.
    const atEarlyColumn = placements.filter((p) => p.line === 4 && p.startColumn <= 5 && p.endColumn > 5)
    expect(atEarlyColumn.every((p) => p.color === '#ef4444')).toBe(true)
  })

  // When two checkers overlap, the one starting at an earlier column sits nearer
  // the text (higher lane) and the later one tucks below it.
  it('draws the earlier-starting checker nearer the text than a later overlapping one', () => {
    const { placements } = layoutSquiggles(
      [
        diag({ line: 4, column: 5, endLine: 4, endColumn: 34, checkerLabel: 'mypy', color: '#ef4444' }),
        diag({ line: 4, column: 21, endLine: 4, endColumn: 25, checkerLabel: 'pyright', color: '#3b82f6' }),
      ],
      () => 34,
    )
    expect(laneByColor(placements, '#ef4444')).toBeGreaterThan(laneByColor(placements, '#3b82f6'))
  })
})
