#!/usr/bin/env node
/**
 * Update Changelog.tsx with actual version number
 * Called by semantic-release during the prepare phase
 *
 * Usage: node scripts/update-changelog-version.js <version>
 * Example: node scripts/update-changelog-version.js 0.13.0
 */

import * as fs from 'fs'
import * as path from 'path'

const RELEASES_PATH = path.join(process.cwd(), 'src/config/releases.ts')

function formatDate() {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const now = new Date()
  const month = months[now.getMonth()]
  const day = now.getDate()
  const year = now.getFullYear()
  return `${month} ${day}, ${year}`
}

function main() {
  const version = process.argv[2]

  if (!version) {
    console.error('Usage: node scripts/update-changelog-version.js <version>')
    process.exit(1)
  }

  // Remove leading 'v' if present
  const cleanVersion = version.replace(/^v/, '')

  // Read current releases file
  let content
  try {
    content = fs.readFileSync(RELEASES_PATH, 'utf8')
  } catch {
    console.log('releases.ts not found, skipping version update')
    process.exit(0)
  }

  // Check if "Next Release" section exists
  if (!content.includes("version: 'Next Release'")) {
    console.log('No "Next Release" section found, skipping')
    process.exit(0)
  }

  const date = formatDate()

  // Replace "Next Release" with actual version
  const updatedContent = content
    .replace("version: 'Next Release'", `version: '${cleanVersion}'`)
    .replace("date: ''", `date: '${date}'`)

  // Write updated content
  fs.writeFileSync(RELEASES_PATH, updatedContent)

  console.log(`Updated releases.ts: Next Release → ${cleanVersion} (${date})`)
}

main()
