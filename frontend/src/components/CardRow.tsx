import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

import * as styles from './CardRow.module.css';

export type ValueColor = 'default' | 'success' | 'warning' | 'error' | 'muted' | 'gold';

interface CardRowProps {
  /** Optional rank number (1, 2, 3...). When provided, shows in rank column. */
  rank?: number;
  /** Primary label/name text (e.g., team name) */
  label: string;
  /** Simple value to display. Mutually exclusive with children. */
  value?: string | number;
  /** Color variant for the value */
  valueColor?: ValueColor;
  /** Custom content instead of value. Mutually exclusive with value. */
  children?: React.ReactNode;
  /** When provided, row becomes clickable with chevron indicator */
  onClick?: () => void;
}

/**
 * Unified row component for card lists.
 *
 * Uses CSS Grid for consistent column alignment across all cards:
 * - With rank: [20px rank] [1fr label] [chevron?] [auto value/children]
 * - Without rank: [1fr label] [chevron?] [auto value/children]
 *
 * @example
 * // Simple ranked row with value
 * <CardRow rank={1} label="Team Name" value={42} valueColor="warning" />
 *
 * // Clickable ranked row with custom children
 * <CardRow rank={1} label="Team Name" onClick={handleClick}>
 *   <span>Custom content</span>
 * </CardRow>
 *
 * // No rank, with value
 * <CardRow label="Team Name" value="2 FT" valueColor="success" />
 *
 * // No rank, with custom children (chip badges)
 * <CardRow label="Team Name">
 *   <ChipBadges chips={['WC', 'BB']} />
 * </CardRow>
 */
export function CardRow({
  rank,
  label,
  value,
  valueColor = 'default',
  children,
  onClick,
}: CardRowProps) {
  const hasRank = rank !== undefined;
  const valueClassName = clsx(styles.value, valueColor !== 'default' && styles[valueColor]);

  const content = (
    <>
      {hasRank && <span className={styles.rank}>{rank}</span>}
      <span className={styles.label}>{label}</span>
      {onClick && <ChevronRight size={16} className={styles.chevron} />}
      {children ?? (value !== undefined && <span className={valueClassName}>{value}</span>)}
    </>
  );

  const className = clsx(styles.CardRow, hasRank && styles.withRank, onClick && styles.clickable);

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
