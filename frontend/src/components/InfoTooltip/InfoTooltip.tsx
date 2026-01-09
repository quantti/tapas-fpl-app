import { Info } from 'lucide-react';
import { useId } from 'react';

import * as styles from './InfoTooltip.module.css';

interface InfoTooltipProps {
  /** Tooltip text to display */
  text: string;
  /** Icon size in pixels */
  size?: number;
}

/**
 * Info icon with tooltip on hover/tap.
 * Works on both desktop (hover) and touch devices (tap triggers focus state).
 */
export function InfoTooltip({ text, size = 14 }: InfoTooltipProps) {
  const tooltipId = useId();

  return (
    <button type="button" className={styles.InfoTooltip} aria-describedby={tooltipId}>
      <Info size={size} className={styles.infoIcon} aria-hidden="true" />
      <span id={tooltipId} className={styles.tooltip} role="tooltip">
        {text}
      </span>
    </button>
  );
}
