import { useState, useCallback, useMemo, type ReactNode } from 'react'

import { hasPreferencesConsent } from '../hooks/useCookieConsent'

import { ManagerIdContext } from './ManagerIdContext'

const COOKIE_NAME = 'fpl_manager_id'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`
}

export function ManagerIdProvider({ children }: { children: ReactNode }) {
  const [managerId, setManagerIdState] = useState<number | null>(() => {
    const stored = getCookie(COOKIE_NAME)
    if (stored) {
      const parsed = Number.parseInt(stored, 10)
      return Number.isNaN(parsed) ? null : parsed
    }
    return null
  })

  const setManagerId = useCallback((id: number | null) => {
    if (id === null) {
      deleteCookie(COOKIE_NAME)
      setManagerIdState(null)
      return
    }

    // Only store if user has consented to preferences cookies
    if (hasPreferencesConsent()) {
      setCookie(COOKIE_NAME, String(id), COOKIE_MAX_AGE)
    }
    // Always update state for current session
    setManagerIdState(id)
  }, [])

  const clearManagerId = useCallback(() => {
    deleteCookie(COOKIE_NAME)
    setManagerIdState(null)
  }, [])

  const value = useMemo(
    () => ({
      managerId,
      setManagerId,
      clearManagerId,
      isLoggedIn: managerId !== null,
    }),
    [managerId, setManagerId, clearManagerId]
  )

  return <ManagerIdContext.Provider value={value}>{children}</ManagerIdContext.Provider>
}
