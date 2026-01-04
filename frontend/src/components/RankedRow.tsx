import { ChevronRight } from 'lucide-react';

import * as styles from './RankedRow.module.css';

type ValueColor = 'default' | 'success' | 'warning' | 'error';

const colorClassMap: Record<ValueColor, string | undefined> = {
  default: undefined,
  success: styles.colorSuccess,
  warning: styles.colorWarning,
  error: styles.colorError,
};

interface RankedRowProps {
  rank: number;
  name: string;
  value?: string | number;
  valueColor?: ValueColor;
  children?: React.ReactNode;
  onClick?: () => void;
}

/**
 * @deprecated Use CardRow instead. This component will be removed in a future version.
 * CardRow provides the same functionality with CSS Grid for better alignment.
 */
export function RankedRow({
  rank,
  name,
  value,
  valueColor = 'default',
  children,
  onClick,
}: RankedRowProps) {
  const valueClassName = [styles.value, colorClassMap[valueColor]].filter(Boolean).join(' ');

  const content = (
    <>
      <span className={styles.rank}>{rank}</span>
      <span className={styles.name}>{name}</span>
      {onClick && <ChevronRight size={16} className={styles.chevron} />}
      <span className={styles.spacer} />
      {children ?? <span className={valueClassName}>{value}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={styles.clickable} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={styles.RankedRow}>{content}</div>;
}
