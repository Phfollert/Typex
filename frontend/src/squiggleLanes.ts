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

// A finding fills the whole contiguous reading-order range from its start to its
// end (middle rows are full-width), so its coverage IS the half-open interval
// [(line,col), (endLine,endCol)) in the totally-ordered (line, col) space. That
// lets lanes be assigned on whole findings with one interval-overlap test,
// instead of per-line segments -- so a multi-line finding is a single interval
// on a single lane (continuity is automatic), and the per-line split is left to
// rendering.
//
// The lane unit is a "run": same-checker findings whose intervals overlap are
// unioned, so they share one lane and resolveSpans merges them to the highest
// severity; a checker's disjoint findings stay in separate runs and can take
// different lanes. Runs are placed in document order, each taking the lowest
// free lane. Lane 1 is closest to the text; overlapping runs stack outward (the
// render layer inverts lane -> depth, see CodeEditor/ensureLaneStyles).
const posKey = (line: number, column: number) => line * 10_000_000 + column

export function layoutSquiggles(
  diagnostics: EditorDiagnostic[],
  lineEndColumn: (line: number) => number,
): SquiggleLayout {
  // One interval per finding, carrying its segments for the render-time split.
  const findings = diagnostics.map((d) => {
    const segs = expandToSegments([d], lineEndColumn)
    const first = segs[0]
    const last = segs[segs.length - 1]
    return {
      segs,
      checkerLabel: d.checkerLabel,
      startKey: posKey(first.line, first.startColumn),
      endKey: posKey(last.line, last.endColumn),
    }
  })

  const overlaps = (a: { startKey: number; endKey: number }, b: { startKey: number; endKey: number }) =>
    a.startKey < b.endKey && b.startKey < a.endKey

  // Union same-checker findings whose intervals overlap.
  const parent = findings.map((_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      if (findings[i].checkerLabel === findings[j].checkerLabel && overlaps(findings[i], findings[j])) {
        parent[find(i)] = find(j)
      }
    }
  }

  type Run = { segs: Segment[]; startKey: number; endKey: number }
  const runMap = new Map<number, Run>()
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]
    const run = runMap.get(find(i))
    if (run) {
      run.segs.push(...f.segs)
      run.startKey = Math.min(run.startKey, f.startKey)
      run.endKey = Math.max(run.endKey, f.endKey)
    } else {
      runMap.set(find(i), { segs: [...f.segs], startKey: f.startKey, endKey: f.endKey })
    }
  }

  const runs = [...runMap.values()].sort((a, b) => a.startKey - b.startKey || a.endKey - b.endKey)

  const placed: { startKey: number; endKey: number; lane: number }[] = []
  const placements: PlacedSegment[] = []
  let maxLane = 0
  for (const run of runs) {
    const taken = new Set<number>()
    for (const p of placed) if (overlaps(run, p)) taken.add(p.lane)
    let lane = 1
    while (taken.has(lane)) lane++
    placed.push({ startKey: run.startKey, endKey: run.endKey, lane })
    for (const span of resolveSpans(run.segs)) placements.push({ ...span, lane })
    if (lane > maxLane) maxLane = lane
  }

  return { placements, maxLane }
}
