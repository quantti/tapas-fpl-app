/**
 * Semantic Release Configuration
 * Fully automated versioning based on conventional commits
 *
 * Commit types and their version impact:
 * - fix:    → PATCH (1.0.0 → 1.0.1)
 * - feat:   → MINOR (1.0.0 → 1.1.0)
 * - feat!:  → MAJOR (1.0.0 → 2.0.0)
 * - BREAKING CHANGE: in footer → MAJOR
 *
 * Release Notes Workflow:
 * 1. Developer adds release note via: node scripts/add-release-note.js
 * 2. This creates/updates "Next Release" section in Changelog.tsx
 * 3. On release, this script replaces "Next Release" with actual version
 */
export default {
  branches: ['main'],
  plugins: [
    // Analyze commits to determine version bump
    '@semantic-release/commit-analyzer',

    // Generate release notes from commits
    '@semantic-release/release-notes-generator',

    // Update CHANGELOG.md
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],

    // Update version in package.json
    '@semantic-release/npm',

    // Replace "Next Release" with actual version in Changelog.tsx
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node scripts/update-changelog-version.js ${nextRelease.version}',
      },
    ],

    // Commit the changed files (CHANGELOG.md, package.json, Changelog.tsx)
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'src/views/Changelog.tsx'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],

    // Create GitHub Release
    '@semantic-release/github',
  ],
};
