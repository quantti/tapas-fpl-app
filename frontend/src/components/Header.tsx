import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import * as styles from './Header.module.css'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const menuRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const isOutsideMenu = menuRef.current && !menuRef.current.contains(target)
      const isOutsideButton = buttonRef.current && !buttonRef.current.contains(target)

      if (isOutsideMenu && isOutsideButton) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <header className={styles.Header}>
      <div className={styles.logo}>Tapas & Tackles</div>
      <button
        ref={buttonRef}
        className={styles.menuButton}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        data-testid="menu-button"
      >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {menuOpen && (
        <nav ref={menuRef} className={styles.nav} data-testid="nav-menu">
          <Link
            to="/"
            className={`${styles.navLink} ${location.pathname === '/' ? styles.active : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            to="/statistics"
            className={`${styles.navLink} ${location.pathname === '/statistics' ? styles.active : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Statistics
          </Link>
          <Link
            to="/analytics"
            className={`${styles.navLink} ${location.pathname === '/analytics' ? styles.active : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Analytics
          </Link>
          <div className={styles.themeRow}>
            <span className={styles.themeLabel}>
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              Dark Mode
            </span>
            <button
              className={`${styles.toggle} ${theme === 'dark' ? styles.toggleOn : ''}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'dark'}
              data-testid="theme-toggle"
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </nav>
      )}
    </header>
  )
}
