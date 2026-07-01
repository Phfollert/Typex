import { usePopover } from '@/hooks/usePopover';

const VERSIONS = [
  { value: 'py37', label: 'Python 3.7' },
  { value: 'py38', label: 'Python 3.8' },
  { value: 'py39', label: 'Python 3.9' },
  { value: 'py310', label: 'Python 3.10' },
  { value: 'py311', label: 'Python 3.11' },
  { value: 'py312', label: 'Python 3.12' },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function VersionPicker({ value, onChange }: Props) {
  const { id, triggerRef, popoverRef } = usePopover('end');
  const current = VERSIONS.find((v) => v.value === value)?.label ?? value;

  return (
    <div className="version-picker">
      <button ref={triggerRef} popoverTarget={id} className="pane-action" title="Python target version">
        {current} ▾
      </button>
      <div ref={popoverRef} id={id} popover="auto" className="version-menu">
        {VERSIONS.map((ver) => (
          <button
            key={ver.value}
            className={`version-item${ver.value === value ? ' active' : ''}`}
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={() => onChange(ver.value)}
          >
            {ver.label}
          </button>
        ))}
      </div>
    </div>
  );
}
