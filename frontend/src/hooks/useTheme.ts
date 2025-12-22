import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return null
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = getStoredTheme()
    return stored ?? getSystemTheme()
  })

  const [isUsingSystem, setIsUsingSystem] = useState<boolean>(() => {
    return getStoredTheme() === null
  })

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if user hasn't explicitly chosen a theme
      if (isUsingSystem) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [isUsingSystem])

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    setIsUsingSystem(false)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [theme])

  const resetToSystem = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setIsUsingSystem(true)
    setTheme(getSystemTheme())
  }, [])

  return {
    theme,
    toggleTheme,
    isUsingSystem,
    resetToSystem,
  }
}
