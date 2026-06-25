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

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, information: 2 }

// A checker draws one shape across its lane: the most severe among its findings
// (error > warning > information). This also avoids two findings of the same
// checker fighting over the lane's single background slot.
function mostSevereShape(segs: MergedSegment[]): SquiggleShape {
  let best = segs[0]
  for (const s of segs) {
    if (SEVERITY_RANK[s.severity] < SEVERITY_RANK[best.severity]) best = s
  }
  return best.shape
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
//
// Each checker occupies a single lane, so its own overlapping findings share
// that lane instead of stacking against each other. Lanes are packed (two
// checkers whose findings never overlap can share a lane), and the widest
// checker is given the highest lane number. The squiggle CSS stacks higher lane
// numbers nearer the text, so the widest checker hugs the text and narrower
// checkers tuck below it.
export function assignLanes(segments: Segment[]): PlacedSegment[] {
  if (segments.length === 0) return []
  const line = segments[0].line
  const merged = dedup(segments)

  const byChecker = new Map<string, MergedSegment[]>()
  for (const m of merged) {
    const group = byChecker.get(m.checker)
    if (group) group.push(m)
    else byChecker.set(m.checker, [m])
  }

  const groups = [...byChecker.entries()].map(([checker, segs]) => ({
    checker,
    segs,
    maxWidth: Math.max(...segs.map(widthOf)),
    shape: mostSevereShape(segs),
  }))

  // Narrowest checker first takes the lowest (bottom) lane; the widest ends up
  // in the highest lane, which the CSS renders nearest the text.
  groups.sort((a, b) => a.maxWidth - b.maxWidth || a.checker.localeCompare(b.checker))

  const placed: PlacedSegment[] = []
  for (const group of groups) {
    const taken = new Set<number>()
    for (const p of placed) {
      if (group.segs.some((s) => overlaps(p, s))) taken.add(p.lane)
    }
    let lane = 1
    while (taken.has(lane)) lane++
    for (const s of group.segs) {
      placed.push({
        line,
        startColumn: s.startColumn,
        endColumn: s.endColumn,
        color: s.color,
        shape: group.shape,
        lane,
        hovers: s.hovers,
      })
    }
  }
  return placed
}
