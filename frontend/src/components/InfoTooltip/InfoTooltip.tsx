import { Info } from 'lucide-react';

import * as styles from './InfoTooltip.module.css';

interface InfoTooltipProps {
  /** Tooltip text to display */
  text: string;
  /** Icon size in pixels */
  size?: number;
}

/**
 * Info icon with tooltip on hover/tap.
 * Works on both desktop (hover) and touch devices (tap triggers hover state).
 */
export function InfoTooltip({ text, size = 14 }: InfoTooltipProps) {
  return (
    <span className={styles.infoWrapper}>
      <Info size={size} className={styles.infoIcon} aria-label="Info" />
      <span className={styles.tooltip} role="tooltip">
        {text}
      </span>
    </span>
  );
}
