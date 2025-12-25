import type { HTMLAttributes } from 'react'
import * as styles from './Card.module.css'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  scrollable?: boolean
  maxHeight?: number
  /** When provided, adds role="region" with this label for accessibility */
  'aria-label'?: string
}

export function Card({
  children,
  className,
  scrollable = false,
  maxHeight,
  'aria-label': ariaLabel,
  ...rest
}: CardProps) {
  const cardClassName = [styles.Card, className].filter(Boolean).join(' ')
  const style = scrollable && maxHeight ? { maxHeight } : undefined

  return (
    <div
      className={cardClassName}
      data-scrollable={scrollable || undefined}
      style={style}
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </div>
  )
}
