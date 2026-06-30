// Generates and injects the SVG-squiggle CSS classes used by Monaco inline
// decorations. One <style> element holds every generated rule; classes are
// cached so each (color, depth, shape) combination is injected once.

import type { SquiggleShape } from '@/types';

// Height of one lane's squiggle strip; also the vertical step between stacked lanes.
export const LANE_HEIGHT_PX = 3;

let styleEl: HTMLStyleElement | null = null;
const classCache = new Map<string, string>();
let counter = 0;
let baseNode: Text | null = null;
let laneMax = 0;

function styleSheet(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.squiggle = 'true';
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

export function squiggleTile(color: string, shape: SquiggleShape): string {
  const stroke = encodeURIComponent(color);
  const inner: Record<SquiggleShape, string> = {
    wavy: `<path d="M0 3 Q 1.5 0 3 1.5 T 6 3" stroke="${stroke}" fill="none" />`,
    dotted: `<circle cx="1.5" cy="2" r="0.9" fill="${stroke}" /><circle cx="4.5" cy="2" r="0.9" fill="${stroke}" />`,
    faint: `<circle cx="1.5" cy="2" r="0.7" fill="${stroke}" fill-opacity="0.5" /><circle cx="4.5" cy="2" r="0.7" fill="${stroke}" fill-opacity="0.5" />`,
  };
  return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="3" width="6">${inner[shape]}</svg>')`;
}

// Returns a class name that sets --bg-<depth> to this color's squiggle.
export function bgSetterClass(color: string, depth: number, shape: SquiggleShape): string {
  const key = `${color}|${depth}|${shape}`;
  const cached = classCache.get(key);
  if (cached) return cached;
  const cls = `sqset-${counter++}`;
  styleSheet().appendChild(
    document.createTextNode(`.${cls} { --bg-${depth}: ${squiggleTile(color, shape)}; }`)
  );
  classCache.set(key, cls);
  return cls;
}

// Generates the `.squiggly-base` background-layer stack and `.squiggly-depth-N`
// padding rules for N lanes, growing on demand. Where lanes stack on the same
// text, lane 1 is the bottom-most (farthest from the text) and higher lanes
// climb toward it.
export function ensureLaneStyles(maxLane: number): void {
  if (maxLane <= laneMax) return;
  const sheet = styleSheet();

  if (!baseNode) {
    baseNode = document.createTextNode('');
    sheet.appendChild(baseNode);
  }

  const layers = (fn: (i: number) => string) =>
    Array.from({ length: maxLane }, (_, i) => fn(i)).join(', ');

  const vars = Array.from({ length: maxLane }, (_, i) => `  --bg-${i + 1}: none;`).join('\n');
  baseNode.data = `.squiggly-base {
${vars}
  background-image: ${layers((i) => `var(--bg-${i + 1})`)};
  background-position: ${layers((i) => `left calc(100% - ${i * LANE_HEIGHT_PX}px)`)};
  background-repeat: ${layers(() => 'repeat-x')};
  background-size: ${layers(() => `auto ${LANE_HEIGHT_PX}px`)};
}`;

  for (let n = laneMax + 1; n <= maxLane; n++) {
    sheet.appendChild(
      document.createTextNode(`.squiggly-depth-${n} { padding-bottom: ${n * LANE_HEIGHT_PX}px; }`)
    );
  }

  laneMax = maxLane;
}
