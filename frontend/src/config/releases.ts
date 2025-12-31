export interface ReleaseItem {
  title: string
  description: string
  type: 'feature' | 'fix'
}

export interface Release {
  version: string
  date: string
  items: ReleaseItem[]
}

export const releases: Release[] = [
  {
    version: 'Next Release',
    date: '',
    items: [
      {
        title: 'Player Details Modal',
        description:
          'Click any player in the lineup or analytics page to see detailed stats. View form vs average, expected stats (xG, xA, xGI, xGC) with per-90 values, performance deltas showing over/underperformance, DefCon tracking for defenders and midfielders, upcoming fixtures with FDR colors, and full season history with visual icons for goals, assists, clean sheets, and bonus points.',
        type: 'feature',
      },
      {
        title: 'Cookie Consent',
        description:
          'GDPR-compliant cookie banner letting you control which cookies we use. Choose between necessary, preferences (saves your league and theme), and analytics cookies.',
        type: 'feature',
      },
      {
        title: 'Release Notifications',
        description:
          'A banner on the dashboard alerts you when new features are available. Click to see the full changelog or dismiss to hide it.',
        type: 'feature',
      },
    ],
  },
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

/**
 * Get the latest release
 */
export function getLatestRelease(): Release {
  return releases[0]
}

/**
 * Get the latest version string
 */
export function getLatestVersion(): string {
  return releases[0].version
}
