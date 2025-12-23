import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
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

function formatTimeRemaining(time: TimeRemaining): string {
  const parts: string[] = []

  if (time.days > 0) {
    parts.push(`${time.days}d`)
  }
  if (time.hours > 0 || time.days > 0) {
    parts.push(`${time.hours}h`)
  }
  parts.push(`${time.minutes}m`)

  // Only show seconds if less than 1 hour
  if (time.days === 0 && time.hours === 0) {
    parts.push(`${time.seconds}s`)
  }

  return parts.join(' ')
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
    <div className={styles.container}>
      <Clock size={14} />
      <span className={styles.label}>GW{gameweekId} deadline:</span>
      <span className={styles.time}>{formatTimeRemaining(timeRemaining)}</span>
    </div>
  )
}
