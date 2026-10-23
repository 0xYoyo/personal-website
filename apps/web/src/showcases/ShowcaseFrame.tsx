import type { CSSProperties, ReactNode } from 'react';
import './base.css';

export interface ShowcaseFrameProps {
  children?: ReactNode;
  /** Accessible name for the piece, e.g. "Unfiltered, motion showcase". */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The abstract rounded-rect "device" every showcase sits in: 16:10, hairline border,
 * scene colours from the nearest [data-scene] ancestor (normally <html>).
 */
export function ShowcaseFrame({ children, label, className, style }: ShowcaseFrameProps) {
  return (
    <div
      className={className ? `sc-frame ${className}` : 'sc-frame'}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}
