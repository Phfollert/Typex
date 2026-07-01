import { usePopover } from '@/hooks/usePopover';
import type { ExampleEntry } from '@/examples/types';

interface Props {
  entries: ExampleEntry[];
  onPick: (entry: ExampleEntry) => void;
}

export default function ExamplePicker({ entries, onPick }: Props) {
  const { id, triggerRef, popoverRef } = usePopover('start');

  return (
    <div className="example-picker">
      <button ref={triggerRef} popoverTarget={id} className="pane-action" title="Load an example">
        ▤ Examples ▾
      </button>
      <div ref={popoverRef} id={id} popover="auto" className="example-menu">
        {entries.length === 0 ? (
          <div className="example-menu-empty">No examples available</div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              className="example-item"
              title={entry.description}
              popoverTarget={id}
              popoverTargetAction="hide"
              onClick={() => onPick(entry)}
            >
              {entry.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
