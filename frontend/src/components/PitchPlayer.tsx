import * as styles from './PitchPlayer.module.css';

import type { ReactNode } from 'react';

interface Props {
  name: string;
  shirtUrl: string;
  teamShortName: string;
  stat: ReactNode;
  badge?: 'C' | 'V';
  isBench?: boolean;
  testId?: string;
  onClick?: () => void;
}

const getShirtUrl = (teamCode: number): string => {
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.webp`;
};

export function PitchPlayer({
  name,
  shirtUrl,
  teamShortName,
  stat,
  badge,
  isBench = false,
  testId = 'player',
  onClick,
}: Props) {
  const content = (
    <>
      <div className={styles.shirt}>
        <img
          src={shirtUrl}
          alt={teamShortName}
          className={styles.shirtImage}
          data-testid="shirt-image"
        />
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.name} data-testid="player-name">
        {name}
      </div>
      <div className={styles.stat}>{stat}</div>
    </>
  );

  const className = `${styles.PitchPlayer}${isBench ? ` ${styles.bench}` : ''}${onClick ? ` ${styles.clickable}` : ''}`;

  if (onClick) {
    return (
      <button type="button" className={className} data-testid={testId} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} data-testid={testId}>
      {content}
    </div>
  );
}

// Utility function for consumers
PitchPlayer.getShirtUrl = getShirtUrl;
