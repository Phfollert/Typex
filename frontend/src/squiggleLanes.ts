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

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, information: 2 }

interface Span {
  line: number
  startColumn: number
  endColumn: number
  color: string
  shape: SquiggleShape
  hovers: HoverBlock[]
}

// Split overlapping findings into non-overlapping spans at every boundary. Each
// span takes the highest-severity shape covering it (so an error masks a warning
// in the overlap) and a hover listing exactly the findings covering it.
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

// A document position, compared lexicographically (line, then column).
type Pos = [line: number, column: number]
const cmpPos = ([al, ac]: Pos, [bl, bc]: Pos) => al - bl || ac - bc

interface Interval {
  start: Pos
  end: Pos
}

// A finding's coverage is the contiguous range [(line,col), (endLine,endCol))
// (middle rows are full-width), so overlap is one lexicographic comparison and a
// multi-line finding stays one interval on one lane.
const overlaps = (a: Interval, b: Interval) => cmpPos(a.start, b.end) < 0 && cmpPos(b.start, a.end) < 0

// A run is one checker's overlapping findings merged onto one lane; its disjoint
// findings form separate runs and can take different lanes.
interface Run extends Interval {
  segs: Segment[]
  checkerLabel: string
}

export function layoutSquiggles(
  diagnostics: EditorDiagnostic[],
  lineEndColumn: (line: number) => number,
): SquiggleLayout {
  const byChecker = new Map<string, Run[]>()
  for (const d of diagnostics) {
    const segs = expandToSegments([d], lineEndColumn)
    const first = segs[0]
    const last = segs[segs.length - 1]
    const run: Run = {
      segs,
      checkerLabel: d.checkerLabel,
      start: [first.line, first.startColumn],
      end: [last.line, last.endColumn],
    }
    const group = byChecker.get(d.checkerLabel)
    if (group) group.push(run)
    else byChecker.set(d.checkerLabel, [run])
  }

  // Merge each checker's overlapping findings into runs (sweep in start order).
  const runs: Run[] = []
  for (const group of byChecker.values()) {
    group.sort((a, b) => cmpPos(a.start, b.start))
    let open: Run | null = null
    for (const f of group) {
      if (open && cmpPos(f.start, open.end) < 0) {
        open.segs.push(...f.segs)
        if (cmpPos(f.end, open.end) > 0) open.end = f.end
      } else {
        open = f
        runs.push(f)
      }
    }
  }

  // Each run takes the lowest free lane. Lane 1 is closest to the text (the
  // render layer inverts lane -> depth, see CodeEditor/ensureLaneStyles).
  runs.sort((a, b) => cmpPos(a.start, b.start) || cmpPos(a.end, b.end) || a.checkerLabel.localeCompare(b.checkerLabel))
  const placed: (Interval & { lane: number })[] = []
  const placements: PlacedSegment[] = []
  let maxLane = 0
  for (const run of runs) {
    const taken = new Set<number>()
    for (const p of placed) if (overlaps(run, p)) taken.add(p.lane)
    let lane = 1
    while (taken.has(lane)) lane++
    placed.push({ start: run.start, end: run.end, lane })
    for (const span of resolveSpans(run.segs)) placements.push({ ...span, lane })
    if (lane > maxLane) maxLane = lane
  }

  return { placements, maxLane }
}
