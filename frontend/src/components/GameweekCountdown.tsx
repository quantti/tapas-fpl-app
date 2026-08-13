import { useState, useEffect } from 'react';

import { calculateTimeRemaining, type TimeRemaining } from 'utils/countdown';

import * as styles from './GameweekCountdown.module.css';

interface Props {
  deadline: string;
  gameweekId: number;
  /** Override header title (default: "Next Deadline") */
  title?: string;
  /** Override header label (default: "Gameweek {gameweekId}") */
  label?: string;
}

function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

export function GameweekCountdown({ deadline, gameweekId, title, label }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(() =>
    calculateTimeRemaining(deadline)
  );

  useEffect(() => {
    // Don't start interval if already expired (initial state handles this)
    if (calculateTimeRemaining(deadline) === null) {
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(deadline);
      setTimeRemaining(remaining);

      // Stop interval once countdown expires to prevent memory leak
      if (remaining === null) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  if (!timeRemaining) return null;

  return (
    <div className={styles.GameweekCountdown}>
      <div className={styles.header}>
        <span className={styles.title}>{title ?? 'Next Deadline'}</span>
        <span className={styles.gameweek}>{label ?? `Gameweek ${gameweekId}`}</span>
      </div>
      <div className={styles.countdown}>
        <div className={styles.unit}>
          <span className={styles.value}>{pad(timeRemaining.days)}</span>
          <span className={styles.label}>Days</span>
        </div>
        <span className={styles.separator}>:</span>
        <div className={styles.unit}>
          <span className={styles.value}>{pad(timeRemaining.hours)}</span>
          <span className={styles.label}>Hours</span>
        </div>
        <span className={styles.separator}>:</span>
        <div className={styles.unit}>
          <span className={styles.value}>{pad(timeRemaining.minutes)}</span>
          <span className={styles.label}>Minutes</span>
        </div>
        <span className={styles.separator}>:</span>
        <div className={styles.unit}>
          <span className={styles.value}>{pad(timeRemaining.seconds)}</span>
          <span className={styles.label}>Seconds</span>
        </div>
      </div>
    </div>
  );
}
