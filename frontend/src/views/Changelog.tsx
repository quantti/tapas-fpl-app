import { Sparkles, Bug, Clock } from 'lucide-react'
import { Header } from '../components/Header'
import * as styles from './Changelog.module.css'

interface ReleaseItem {
  title: string
  description: string
  type: 'feature' | 'fix'
}

interface Release {
  version: string
  date: string
  items: ReleaseItem[]
}

const releases: Release[] = [
  {
    version: '0.13.0',
    date: 'December 31, 2025',
    items: [
      {
        title: "What's New Page",
        description:
          'See the full release history and latest updates. Access it from the menu under "What\'s New".',
        type: 'feature',
      },
    ],
  },
  {
    version: '0.12',
    date: 'December 30, 2025',
    items: [
      {
        title: 'League Update Warning',
        description:
          'A yellow banner now appears when FPL is recalculating league tables, so you know standings may be temporarily out of date.',
        type: 'feature',
      },
      {
        title: 'Real-Time Modal Updates',
        description:
          "Fixed an issue where player scores in the team lineup modal weren't updating during live matches. Scores now refresh automatically.",
        type: 'fix',
      },
    ],
  },
  {
    version: '0.11',
    date: 'December 30, 2025',
    items: [
      {
        title: 'Live Bonus Points in Game Rewards',
        description:
          'The Game Rewards card now shows provisional bonus points during matches. See who is in line for bonus before the final whistle.',
        type: 'feature',
      },
    ],
  },
  {
    version: '0.10',
    date: 'December 30, 2025',
    items: [
      {
        title: 'Roadmap Page',
        description:
          "See what features are coming next! Access it from the menu to stay up to date on what we're building.",
        type: 'feature',
      },
    ],
  },
  {
    version: '0.9',
    date: 'December 29, 2025',
    items: [
      {
        title: 'Game Rewards Card',
        description:
          'New dashboard card showing bonus points and defensive contributions for each fixture. See who earned bonus and which defenders hit the DefCon threshold.',
        type: 'feature',
      },
      {
        title: 'Auto-Substitution Preview',
        description:
          'Live points now account for predicted auto-substitutions when a starting player blanks due to injury or non-appearance.',
        type: 'feature',
      },
    ],
  },
  {
    version: '0.8',
    date: 'December 27, 2025',
    items: [
      {
        title: 'Accessibility Improvements',
        description:
          'Improved color contrast throughout the app for better readability. Now meets WCAG accessibility guidelines.',
        type: 'feature',
      },
      {
        title: 'Accurate Live Points',
        description:
          'Fixed a calculation bug where transfer hit costs were being counted twice for live gameweek points.',
        type: 'fix',
      },
    ],
  },
  {
    version: '0.7',
    date: 'December 26, 2025',
    items: [
      {
        title: 'FPL Updating Message',
        description:
          'When FPL API is unavailable (usually during gameweek transitions), a friendly message is shown instead of an error.',
        type: 'feature',
      },
    ],
  },
  {
    version: '0.6',
    date: 'December 26, 2025',
    items: [
      {
        title: 'Free Transfers Tracker',
        description:
          'See how many free transfers each manager has available. Shows deadline awareness with accurate FT counts.',
        type: 'feature',
      },
      {
        title: 'Free Transfers Accuracy',
        description:
          'Improved calculation accuracy and fixed display when gameweek has not started yet.',
        type: 'fix',
      },
      {
        title: 'Faster Data Updates',
        description:
          'Reduced cache times so gameweek transitions and live data update more quickly.',
        type: 'fix',
      },
    ],
  },
  {
    version: '0.5',
    date: 'December 26, 2025',
    items: [
      {
        title: 'Initial Release',
        description:
          'Live league standings, manager team modals, player ownership stats, transfer display, dark mode, and statistics page with bench points, captain differentials, and league position chart.',
        type: 'feature',
      },
    ],
  },
]

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
