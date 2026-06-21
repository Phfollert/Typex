import { useState, useRef, useEffect } from 'react';
import type { ExampleEntry } from '@/examples/types';

interface Props {
  entries: ExampleEntry[];
  onPick: (entry: ExampleEntry) => void;
}

function groupByCategory(entries: ExampleEntry[]): [string, ExampleEntry[]][] {
  const groups: Map<string, ExampleEntry[]> = new Map();
  for (const e of entries) {
    const list = groups.get(e.category);
    if (list) list.push(e);
    else groups.set(e.category, [e]);
  }
  return Array.from(groups.entries());
}

export default function ExamplePicker({ entries, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = groupByCategory(entries);

  return (
    <div className="example-picker" ref={rootRef}>
      <button className="pane-action" onClick={() => setOpen((o) => !o)} title="Load an example">
        ▤ Examples ▾
      </button>
      {open && (
        <div className="example-menu">
          {groups.length === 0 ? (
            <div className="example-menu-empty">No examples available</div>
          ) : (
            groups.map(([category, items]) => (
              <div key={category} className="example-group">
                <div className="example-group-header">{category}</div>
                {items.map((entry) => (
                  <button
                    key={entry.id}
                    className="example-item"
                    title={entry.description}
                    onClick={() => {
                      onPick(entry);
                      setOpen(false);
                    }}
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
