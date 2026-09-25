import type { ReactNode } from 'react';
import classes from './StatusPill.module.css';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusPillProps {
  tone: StatusTone;
  children: ReactNode;
}

/** A short status in words and colour ("Working", "Needs you"); never colour alone. */
export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={classes.pill} data-tone={tone}>
      {children}
    </span>
  );
}
