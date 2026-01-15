import clsx from 'clsx';

import * as styles from './Roadmap.module.css';

interface Feature {
  title: string;
  description: string;
}

const nowFeatures: Feature[] = [
  {
    title: 'Fixture Difficulty Index',
    description:
      'Custom fixture ratings using 30+ seasons of historical data, head-to-head records, and rest day analysis.',
  },
];

const nextFeatures: Feature[] = [
  {
    title: 'Transfer History Timeline',
    description:
      'Visual timeline of all transfers throughout the season. Track when you brought in players.',
  },
];

const laterFeatures: Feature[] = [
  {
    title: 'Expected Points Engine',
    description:
      "Predictions for each player's expected points based on fixtures, form, and advanced metrics.",
  },
];

interface ColumnProps {
  title: string;
  subtitle: string;
  features: Feature[];
  variant: 'now' | 'next' | 'later';
}

function Column({ title, subtitle, features, variant }: ColumnProps) {
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={clsx(styles.statusDot, styles[variant])} />
        <h2 className={styles.columnTitle}>{title}</h2>
        <span className={styles.columnSubtitle}>{subtitle}</span>
      </div>
      <div className={styles.cards}>
        {features.map((feature) => (
          <div key={feature.title} className={styles.card}>
            <h3 className={styles.cardTitle}>{feature.title}</h3>
            <p className={styles.cardDescription}>{feature.description}</p>
          </div>
        ))}
        {features.length === 0 && <p className={styles.empty}>No features planned</p>}
      </div>
    </div>
  );
}

export function Roadmap() {
  return (
    <div className={styles.Roadmap}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Roadmap for 2026</h1>
        </div>
        <div className={styles.board}>
          <Column title="Now" subtitle="In development" features={nowFeatures} variant="now" />
          <Column title="Next" subtitle="Up next" features={nextFeatures} variant="next" />
          <Column
            title="Later"
            subtitle="On the horizon"
            features={laterFeatures}
            variant="later"
          />
        </div>
      </div>
    </div>
  );
}
