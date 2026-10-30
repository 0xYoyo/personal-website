import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

/**
 * The slot a showcase gets is not one shape: the desktop card's left panel is about square
 * (460 × 498), a phone's is 16:10 (358 × 222). A piece picks one of two compositions from the
 * slot it is in and draws it on a canvas of a fixed design aspect, scaled to fit and centred:
 *   wide: 100 × 62.5 units (16:10)    tall: 100 × 100 units (square)
 * Inside the canvas 1cqw is one unit, on both axes.
 */
export type Variant = 'wide' | 'tall';
export const CANVAS_H: Record<Variant, number> = { wide: 62.5, tall: 100 };

/** 'tall' when the slot is closer to square than to 16:10. Measured with a ResizeObserver; 'wide' until measured. */
export function useVariant(ref: RefObject<HTMLElement>): Variant {
  const [v, setV] = useState<Variant>('wide');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setV(h / w > 0.8 ? 'tall' : 'wide');
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return v;
}

/** The centred design canvas. Its children size and place themselves in cqw of the canvas. */
export function Fit({
  v,
  children,
  className,
  style,
  innerRef,
}: {
  v: Variant;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  innerRef?: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className={'sc-fit' + (className ? ` ${className}` : '')}
      data-v={v}
      style={{ ['--sc-ah' as string]: CANVAS_H[v], ...style }}
    >
      {children}
    </div>
  );
}

/** Position of `el` relative to `root` (layout boxes: transforms are ignored). */
export function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0;
  let y = 0;
  let p: HTMLElement | null = el;
  while (p && p !== root) {
    x += p.offsetLeft;
    y += p.offsetTop;
    const next = p.offsetParent as HTMLElement | null;
    if (next && next !== root && !root.contains(next)) break;
    p = next;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
