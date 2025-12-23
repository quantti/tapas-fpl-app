import { useState, useEffect } from 'react'
import * as styles from './GameweekCountdown.module.css'

interface Props {
  deadline: string
  gameweekId: number
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calculateTimeRemaining(deadline: string): TimeRemaining | null {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

function pad(num: number): string {
  return num.toString().padStart(2, '0')
}

export function GameweekCountdown({ deadline, gameweekId }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(() =>
    calculateTimeRemaining(deadline)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(deadline))
    }, 1000)

    return () => clearInterval(interval)
  }, [deadline])

  if (!timeRemaining) return null

  return (
    <div className={styles.GameweekCountdown}>
      <div className={styles.header}>
        <span className={styles.title}>Next Deadline</span>
        <span className={styles.gameweek}>Gameweek {gameweekId}</span>
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
  )
}
