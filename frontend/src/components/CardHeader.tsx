import * as styles from './CardHeader.module.css';

interface CardHeaderProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function CardHeader({ icon, children, action }: CardHeaderProps) {
  return (
    <h3 className={styles.CardHeader}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.title}>{children}</span>
      {action && <span className={styles.action}>{action}</span>}
    </h3>
  );
}
