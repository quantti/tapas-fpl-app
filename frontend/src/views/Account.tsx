import { User, LogOut, Info } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { hasPreferencesConsent } from '../hooks/useCookieConsent'
import { useManagerId } from '../hooks/useManagerId'

import * as styles from './Account.module.css'

export function Account() {
  const { managerId, setManagerId, clearManagerId, isLoggedIn } = useManagerId()
  const [inputValue, setInputValue] = useState(managerId?.toString() ?? '')
  const [saved, setSaved] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const id = Number.parseInt(inputValue.trim(), 10)
    if (!Number.isNaN(id) && id > 0) {
      setManagerId(id)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleLogout = () => {
    clearManagerId()
    setInputValue('')
  }

  const hasConsent = hasPreferencesConsent()

  return (
    <div className={styles.Account}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.subtitle}>
            Link your FPL manager ID to unlock personalized features
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <User size={20} />
            <h2 className={styles.cardTitle}>Manager ID</h2>
          </div>

          {isLoggedIn ? (
            <div className={styles.loggedIn}>
              <p className={styles.status}>
                Linked to manager <strong>{managerId}</strong>
              </p>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                <LogOut size={16} />
                Unlink
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label htmlFor="manager-id" className={styles.label}>
                  Your FPL Manager ID
                </label>
                <input
                  id="manager-id"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 123456"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.hint}>
                  Find your ID in your FPL team URL: fantasy.premierleague.com/entry/
                  <strong>123456</strong>/...
                </p>
              </div>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={!inputValue.trim() || saved}
              >
                {saved ? '✓ Saved' : 'Save'}
              </button>
            </form>
          )}

          {!hasConsent && (
            <div className={styles.consentWarning}>
              <Info size={14} />
              <span>
                Enable &quot;Preferences&quot; cookies to save your manager ID between sessions.
              </span>
            </div>
          )}
        </div>

        <div className={styles.futureCard}>
          <h3 className={styles.futureTitle}>Coming Soon</h3>
          <p className={styles.futureText}>
            Official FPL login integration for automatic team syncing and more personalized
            features.
          </p>
        </div>
      </div>
    </div>
  )
}
