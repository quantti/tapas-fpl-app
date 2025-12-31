import { useState, useCallback } from 'react'
import { getLatestRelease, type Release } from '../config/releases'

const STORAGE_KEY = 'tapas_last_seen_version'

/**
 * Hook to manage release notification banner visibility.
 * Stores last seen version in localStorage (under "necessary" - no consent needed).
 */
export function useReleaseNotification() {
  const latestRelease = getLatestRelease()
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Show notification if user hasn't seen the latest version
  const shouldShow = lastSeenVersion !== latestRelease.version

  const markAsSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, latestRelease.version)
      setLastSeenVersion(latestRelease.version)
    } catch {
      // localStorage might be disabled
    }
  }, [latestRelease.version])

  return {
    shouldShow,
    latestRelease,
    markAsSeen,
  }
}

/**
 * Get the summary for the release notification.
 * Returns counts like "2 new features, 1 fix" or "1 new feature".
 */
export function getReleaseSummary(release: Release): string {
  const featureCount = release.items.filter((item) => item.type === 'feature').length
  const fixCount = release.items.filter((item) => item.type === 'fix').length

  const parts: string[] = []

  if (featureCount > 0) {
    parts.push(`${featureCount} new feature${featureCount > 1 ? 's' : ''}`)
  }
  if (fixCount > 0) {
    parts.push(`${fixCount} fix${fixCount > 1 ? 'es' : ''}`)
  }

  return parts.join(', ') || 'Updates available'
}
