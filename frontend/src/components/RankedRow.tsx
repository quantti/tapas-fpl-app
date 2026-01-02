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
}

export function RankedRow({ rank, name, value, valueColor = 'default', children }: RankedRowProps) {
  const valueClassName = [styles.value, colorClassMap[valueColor]].filter(Boolean).join(' ');

  return (
    <div className={styles.RankedRow}>
      <span className={styles.rank}>{rank}</span>
      <span className={styles.name}>{name}</span>
      {children ?? <span className={valueClassName}>{value}</span>}
    </div>
  );
}
