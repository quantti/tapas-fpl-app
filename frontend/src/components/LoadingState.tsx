import * as styles from './LoadingState.module.css'
import { Spinner } from './Spinner'

interface LoadingStateProps {
  /** Message to display below spinner */
  message?: string
  /** Spinner size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS class name for wrapper */
  className?: string
}

/**
 * Centered loading state with spinner and optional message.
 * Use this for page-level or section-level loading states.
 */
export function LoadingState({
  message = 'Loading...',
  size = 'md',
  className = '',
}: LoadingStateProps) {
  return (
    <div className={`${styles.LoadingState} ${className}`.trim()}>
      <Spinner size={size} />
      {message && <p>{message}</p>}
    </div>
  )
}
