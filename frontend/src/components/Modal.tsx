import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import * as styles from './Modal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}

/**
 * Accessible modal using native <dialog> element.
 * Features: focus trap, ESC to close, backdrop click to close, scroll lock
 */
export function Modal({ isOpen, onClose, title, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Handle open/close
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      dialog.showModal()
      // Lock body scroll
      document.body.style.overflow = 'hidden'
    } else {
      dialog.close()
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle ESC key and backdrop click
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }

    const handleClick = (e: MouseEvent) => {
      // Close if clicking on the dialog backdrop (not content)
      if (e.target === dialog) {
        onClose()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('click', handleClick)

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('click', handleClick)
    }
  }, [onClose])

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Prevent clicks inside content from closing modal
    e.stopPropagation()
  }, [])

  const handleContentKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent keydown inside content from bubbling (for consistency with click)
    e.stopPropagation()
  }, [])

  return (
    <dialog ref={dialogRef} className={styles.Modal}>
      <div
        className={styles.content}
        onClick={handleContentClick}
        onKeyDown={handleContentKeyDown}
        role="presentation"
      >
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  )
}
