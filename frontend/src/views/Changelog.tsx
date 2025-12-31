import { Sparkles, Bug, Clock } from 'lucide-react'
import { Header } from '../components/Header'
import { releases, type Release } from '../config/releases'
import * as styles from './Changelog.module.css'

function ReleaseCard({ release }: { release: Release }) {
  const features = release.items.filter((item) => item.type === 'feature')
  const fixes = release.items.filter((item) => item.type === 'fix')

  return (
    <div className={styles.release}>
      <div className={styles.releaseHeader}>
        <div className={styles.versionBadge}>v{release.version}</div>
        <span className={styles.releaseDate}>
          <Clock size={14} />
          {release.date}
        </span>
      </div>

      {features.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Sparkles size={16} className={styles.featureIcon} />
            What&apos;s New
          </h3>
          <ul className={styles.itemList}>
            {features.map((item) => (
              <li key={item.title} className={styles.item}>
                <strong className={styles.itemTitle}>{item.title}</strong>
                <p className={styles.itemDescription}>{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fixes.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Bug size={16} className={styles.fixIcon} />
            Bug Fixes
          </h3>
          <ul className={styles.itemList}>
            {fixes.map((item) => (
              <li key={item.title} className={styles.item}>
                <strong className={styles.itemTitle}>{item.title}</strong>
                <p className={styles.itemDescription}>{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Changelog() {
  return (
    <div className={styles.Changelog}>
      <Header />
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>What&apos;s New</h1>
          <p className={styles.subtitle}>Updates and improvements to Tapas &amp; Tackles</p>
        </div>
        <div className={styles.releases}>
          {releases.map((release) => (
            <ReleaseCard key={release.version} release={release} />
          ))}
        </div>
      </div>
    </div>
  )
}
