// Generates and injects the SVG-squiggle CSS classes used by Monaco inline
// decorations. One <style> element holds every generated rule; classes are
// cached so each (color, depth, shape) combination is injected once.

export type SquiggleShape = 'wavy' | 'dotted';

let styleEl: HTMLStyleElement | null = null;
const classCache = new Map<string, string>();
let counter = 0;

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
  const inner =
    shape === 'wavy'
      ? `<path d="M0 3 Q 1.5 0 3 1.5 T 6 3" stroke="${stroke}" fill="none" />`
      : `<circle cx="1.5" cy="2" r="0.9" fill="${stroke}" /><circle cx="4.5" cy="2" r="0.9" fill="${stroke}" />`;
  return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="3" width="6">${inner}</svg>')`;
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
