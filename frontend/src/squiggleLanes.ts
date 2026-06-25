import type { EditorDiagnostic, Severity, SquiggleShape } from '@/types'

export interface Segment {
  line: number
  startColumn: number
  endColumn: number
  checker: string
  checkerLabel: string
  color: string
  severity: Severity
  shape: SquiggleShape
  message: string
}

const SHAPE_BY_SEVERITY: Record<Severity, SquiggleShape> = {
  error: 'wavy',
  warning: 'dotted',
  information: 'faint',
}

export function shapeFor(severity: Severity): SquiggleShape {
  return SHAPE_BY_SEVERITY[severity]
}

// lineEndColumn(line) returns the column just past the last character on that
// line (Monaco's model.getLineMaxColumn), used to size full-width segments.
export function expandToSegments(
  diagnostics: EditorDiagnostic[],
  lineEndColumn: (line: number) => number,
): Segment[] {
  const segments: Segment[] = []

  for (const d of diagnostics) {
    const base = {
      checker: d.checker,
      checkerLabel: d.checkerLabel,
      color: d.color,
      severity: d.severity,
      shape: shapeFor(d.severity),
      message: d.message,
    }
    const endLine = d.endLine && d.endLine > d.line ? d.endLine : d.line

    if (endLine === d.line) {
      const endColumn =
        d.endColumn && d.endColumn > d.character ? d.endColumn : d.character + 10
      segments.push({ ...base, line: d.line, startColumn: d.character, endColumn })
      continue
    }

    for (let line = d.line; line <= endLine; line++) {
      const startColumn = line === d.line ? d.character : 1
      const endColumn = line === endLine ? d.endColumn : lineEndColumn(line)
      segments.push({
        ...base,
        line,
        startColumn,
        endColumn: Math.max(endColumn, startColumn + 1),
      })
    }
  }

  return segments
}

export interface HoverBlock {
  checkerLabel: string
  severity: Severity
  message: string
}

export interface PlacedSegment {
  line: number
  startColumn: number
  endColumn: number
  color: string
  shape: SquiggleShape
  lane: number // 1-based
  hovers: HoverBlock[]
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, information: 2 }

// Half-open column ranges overlap when each starts before the other ends.
function overlaps(a: { startColumn: number; endColumn: number }, b: { startColumn: number; endColumn: number }): boolean {
  return a.startColumn < b.endColumn && b.startColumn < a.endColumn
}

interface MergedSegment {
  startColumn: number
  endColumn: number
  color: string
  shape: SquiggleShape
  checker: string
  severity: Severity
  hovers: HoverBlock[]
}

function dedup(segments: Segment[]): MergedSegment[] {
  const byKey = new Map<string, MergedSegment>()
  for (const s of segments) {
    const key = `${s.color}|${s.shape}|${s.startColumn}|${s.endColumn}`
    const hover: HoverBlock = { checkerLabel: s.checkerLabel, severity: s.severity, message: s.message }
    const existing = byKey.get(key)
    if (existing) {
      existing.hovers.push(hover)
    } else {
      byKey.set(key, {
        startColumn: s.startColumn,
        endColumn: s.endColumn,
        color: s.color,
        shape: s.shape,
        checker: s.checker,
        severity: s.severity,
        hovers: [hover],
      })
    }
  }
  return [...byKey.values()]
}

function widthOf(s: { startColumn: number; endColumn: number }): number {
  return s.endColumn - s.startColumn
}

export interface SquiggleLayout {
  placements: PlacedSegment[]
  maxLane: number
}

export function layoutSquiggles(
  diagnostics: EditorDiagnostic[],
  lineEndColumn: (line: number) => number,
): SquiggleLayout {
  const segments = expandToSegments(diagnostics, lineEndColumn)

  const byLine = new Map<number, Segment[]>()
  for (const s of segments) {
    const list = byLine.get(s.line)
    if (list) list.push(s)
    else byLine.set(s.line, [s])
  }

  const placements: PlacedSegment[] = []
  let maxLane = 0
  for (const lineSegments of byLine.values()) {
    for (const p of assignLanes(lineSegments)) {
      placements.push(p)
      if (p.lane > maxLane) maxLane = p.lane
    }
  }

  return { placements, maxLane }
}

// Lays out the segments of a SINGLE line. Callers group by line first.
export function assignLanes(segments: Segment[]): PlacedSegment[] {
  if (segments.length === 0) return []
  const line = segments[0].line

  const merged = dedup(segments)
  merged.sort(
    (a, b) =>
      widthOf(b) - widthOf(a) ||
      a.startColumn - b.startColumn ||
      a.checker.localeCompare(b.checker) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )

  const placed: PlacedSegment[] = []
  for (const m of merged) {
    const taken = new Set(placed.filter((p) => overlaps(p, m)).map((p) => p.lane))
    let lane = 1
    while (taken.has(lane)) lane++
    placed.push({
      line,
      startColumn: m.startColumn,
      endColumn: m.endColumn,
      color: m.color,
      shape: m.shape,
      lane,
      hovers: m.hovers,
    })
  }
  return placed
}
