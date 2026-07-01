import { useEffect, useId, useRef } from 'react';

// Wires a native `popover="auto"` element to a `popovertarget` trigger. The browser
// owns open/close, light-dismiss (outside-press + Escape), and top-layer stacking;
// this hook only positions the popover under its trigger on open, since a top-layer
// popover is viewport-positioned and CSS anchor positioning is not yet universal.
type Align = 'start' | 'end';

export function usePopover(align: Align = 'start') {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pop = popoverRef.current;
    const trigger = triggerRef.current;
    if (!pop || !trigger) return;
    // beforetoggle fires before paint, so positioning here avoids an open-at-center flash.
    const onBeforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      const r = trigger.getBoundingClientRect();
      pop.style.top = `${r.bottom + 4}px`;
      if (align === 'end') {
        pop.style.right = `${window.innerWidth - r.right}px`;
        pop.style.left = 'auto';
      } else {
        pop.style.left = `${r.left}px`;
        pop.style.right = 'auto';
      }
    };
    pop.addEventListener('beforetoggle', onBeforeToggle);
    return () => pop.removeEventListener('beforetoggle', onBeforeToggle);
  }, [align]);

  return { id, triggerRef, popoverRef };
}
