import type { EditorDiagnostic, Severity, SquiggleShape } from '@/types'

export interface Segment {
  line: number
  startColumn: number
  endColumn: number
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
      checkerLabel: d.checkerLabel,
      color: d.color,
      severity: d.severity,
      shape: shapeFor(d.severity),
      message: d.message,
    }
    const endLine = d.endLine && d.endLine > d.line ? d.endLine : d.line

    if (endLine === d.line) {
      const endColumn =
        d.endColumn && d.endColumn > d.column ? d.endColumn : d.column + 10
      segments.push({ ...base, line: d.line, startColumn: d.column, endColumn })
      continue
    }

    for (let line = d.line; line <= endLine; line++) {
      const startColumn = line === d.line ? d.column : 1
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

// Two segments collide when they share a line and their half-open column ranges
// overlap (each starts before the other ends).
function collides(
  a: { line: number; startColumn: number; endColumn: number },
  b: { line: number; startColumn: number; endColumn: number },
): boolean {
  return a.line === b.line && a.startColumn < b.endColumn && b.startColumn < a.endColumn
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, information: 2 }

interface Span {
  line: number
  startColumn: number
  endColumn: number
  color: string
  shape: SquiggleShape
  hovers: HoverBlock[]
}

// A checker's start is its earliest finding in document order (topmost line,
// then leftmost column), encoded as one sortable number.
function startOf(segs: Segment[]): number {
  let best = Infinity
  for (const s of segs) {
    const at = s.line * 1_000_000 + s.startColumn
    if (at < best) best = at
  }
  return best
}

// Flatten one checker's overlapping findings into non-overlapping spans, split
// at every finding boundary. Each span uses the shape of the highest-severity
// finding covering it (error > warning > information), so an error masks a
// warning where they overlap and the warning still shows past the error's end.
// Each span's hover lists exactly the findings covering that column range.
// Findings at an identical range collapse into one span.
function resolveSpans(segs: Segment[]): Span[] {
  const byLine = new Map<number, Segment[]>()
  for (const s of segs) {
    const list = byLine.get(s.line)
    if (list) list.push(s)
    else byLine.set(s.line, [s])
  }

  const spans: Span[] = []
  for (const [line, lineSegs] of byLine) {
    const bounds = [...new Set(lineSegs.flatMap((s) => [s.startColumn, s.endColumn]))].sort((a, b) => a - b)
    for (let i = 0; i < bounds.length - 1; i++) {
      const startColumn = bounds[i]
      const endColumn = bounds[i + 1]
      const covering = lineSegs.filter((s) => s.startColumn <= startColumn && endColumn <= s.endColumn)
      if (covering.length === 0) continue
      let top = covering[0]
      for (const s of covering) {
        if (SEVERITY_RANK[s.severity] < SEVERITY_RANK[top.severity]) top = s
      }
      spans.push({
        line,
        startColumn,
        endColumn,
        color: top.color,
        shape: top.shape,
        hovers: covering.map((s) => ({ checkerLabel: s.checkerLabel, severity: s.severity, message: s.message })),
      })
    }
  }
  return spans
}

export interface SquiggleLayout {
  placements: PlacedSegment[]
  maxLane: number
}

// Each checker occupies a single lane across every line it touches, so a
// multi-line finding keeps one continuous lane down all its rows. Each checker
// greedily takes the lowest lane no overlapping squiggle already uses.
// Higher lane numbers render nearer the text (see ensureLaneStyles). The
// earliest-starting checker should sit nearest the text, so we place the latest
// starter first (it takes lane 1, farthest from the text) and leave the highest
// lanes for the earliest starters.
export function layoutSquiggles(
  diagnostics: EditorDiagnostic[],
  lineEndColumn: (line: number) => number,
): SquiggleLayout {
  const segments = expandToSegments(diagnostics, lineEndColumn)

  const byChecker = new Map<string, Segment[]>()
  for (const s of segments) {
    const group = byChecker.get(s.checkerLabel)
    if (group) group.push(s)
    else byChecker.set(s.checkerLabel, [s])
  }

  const groups = [...byChecker.entries()].map(([key, segs]) => ({
    key,
    segs,
    start: startOf(segs),
  }))
  groups.sort((a, b) => b.start - a.start || a.key.localeCompare(b.key))

  const placements: PlacedSegment[] = []
  let maxLane = 0
  for (const { segs } of groups) {
    const spans = resolveSpans(segs)

    const taken = new Set<number>()
    for (const p of placements) {
      if (spans.some((span) => collides(p, span))) taken.add(p.lane)
    }
    let lane = 1
    while (taken.has(lane)) lane++

    for (const span of spans) {
      placements.push({ ...span, lane })
    }
    if (lane > maxLane) maxLane = lane
  }

  return { placements, maxLane }
}
