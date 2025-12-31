import * as CookieConsent from 'vanilla-cookieconsent'

export type CookieCategory = 'necessary' | 'preferences' | 'analytics'

/**
 * Check if user has accepted a specific cookie category
 */
export function hasConsent(category: CookieCategory): boolean {
  return CookieConsent.acceptedCategory(category)
}

/**
 * Check if user has accepted the preferences category
 * Use this before storing user preferences like league ID, theme, etc.
 */
export function hasPreferencesConsent(): boolean {
  return hasConsent('preferences')
}

/**
 * Check if user has accepted the analytics category
 * Use this before initializing analytics scripts
 */
export function hasAnalyticsConsent(): boolean {
  return hasConsent('analytics')
}

/**
 * Open the cookie preferences modal
 */
export function openCookiePreferences(): void {
  CookieConsent.showPreferences()
}

/**
 * Accept all cookie categories
 */
export function acceptAllCookies(): void {
  CookieConsent.acceptCategory('all')
}

/**
 * Accept only necessary cookies (reject optional)
 */
export function acceptNecessaryOnly(): void {
  CookieConsent.acceptCategory([])
}

/**
 * Accept specific categories
 */
export function acceptCategories(categories: CookieCategory[]): void {
  CookieConsent.acceptCategory(categories)
}
