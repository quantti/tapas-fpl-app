import { Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useReleaseNotification, getReleaseSummary } from '../hooks/useReleaseNotification';

import * as styles from './ReleaseNotification.module.css';

/**
 * Banner displayed when there's a new release the user hasn't seen.
 * Clicking the link or the close button dismisses it.
 */
export function ReleaseNotification() {
  const { shouldShow, latestRelease, markAsSeen } = useReleaseNotification();

  if (!shouldShow) {
    return null;
  }

  const summary = getReleaseSummary(latestRelease);

  return (
    <div className={styles.ReleaseNotification} data-testid="release-notification">
      <Sparkles size={16} className={styles.icon} />
      <Link to="/changelog" className={styles.link} onClick={markAsSeen}>
        <span className={styles.version}>v{latestRelease.version}</span>
        <span className={styles.separator}>—</span>
        <span className={styles.message}>{summary}</span>
      </Link>
      <button
        type="button"
        className={styles.closeButton}
        onClick={markAsSeen}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
