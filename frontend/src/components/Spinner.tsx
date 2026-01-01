import clsx from 'clsx'

import * as styles from './Spinner.module.css'

interface SpinnerProps {
  /** Size variant: sm (24px), md (40px default), lg (56px) */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS class name */
  className?: string
}

/**
 * Animated loading spinner with size variants.
 * Uses CSS border animation for the spinning effect.
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(styles.spinner, size !== 'md' && styles[size], className)}
    />
  )
}
