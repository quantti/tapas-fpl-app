import { ChevronRight } from 'lucide-react'

import * as styles from './ListRowButton.module.css'

interface ListRowButtonProps {
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export function ListRowButton({ onClick, children, className }: ListRowButtonProps) {
  const buttonClassName = [styles.ListRowButton, className].filter(Boolean).join(' ')

  return (
    <button type="button" className={buttonClassName} onClick={onClick}>
      {children}
      <ChevronRight size={16} className={styles.chevron} />
    </button>
  )
}
