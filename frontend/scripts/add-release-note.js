#!/usr/bin/env node
/**
 * Add a release note to releases.ts
 *
 * Usage:
 *   node scripts/add-release-note.js "Title" "Description"
 *   node scripts/add-release-note.js  (interactive mode)
 *
 * Examples:
 *   node scripts/add-release-note.js "Dark Mode" "Toggle between light and dark themes."
 *   node scripts/add-release-note.js "Bug Fix" "Fixed login timeout issue." fix
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const RELEASES_PATH = path.join(process.cwd(), 'src/config/releases.ts');

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function addReleaseNote(title, description, type = 'feature') {
  // Read current changelog
  const content = fs.readFileSync(RELEASES_PATH, 'utf8');

  // Check if "Next Release" section exists
  const hasNextRelease = content.includes("version: 'Next Release'");

  // Escape quotes for JSX
  const escapedTitle = title.trim().replace(/'/g, "\\'");
  const escapedDesc = description.trim().replace(/'/g, "\\'");

  const newItem = `      {
        title: '${escapedTitle}',
        description:
          '${escapedDesc}',
        type: '${type}',
      },`;

  let updatedContent;

  if (hasNextRelease) {
    // Add to existing "Next Release" section
    updatedContent = content.replace(
      /(version: 'Next Release',\s*date: '',\s*items: \[)/,
      `$1\n${newItem}`
    );
  } else {
    // Create new "Next Release" section at the top
    const newSection = `  {
    version: 'Next Release',
    date: '',
    items: [
${newItem}
    ],
  },
  `;
    updatedContent = content.replace(
      'const releases: Release[] = [',
      `const releases: Release[] = [\n${newSection}`
    );
  }

  // Write updated content
  fs.writeFileSync(RELEASES_PATH, updatedContent);

  return { title, description, type, isNew: !hasNextRelease };
}

async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n Add Release Note\n');

  const title = await question(rl, 'Feature title (e.g., "Dark Mode Toggle"): ');
  if (!title.trim()) {
    console.log('Title is required');
    rl.close();
    process.exit(1);
  }

  const description = await question(rl, 'Description (one sentence): ');
  if (!description.trim()) {
    console.log('Description is required');
    rl.close();
    process.exit(1);
  }

  rl.close();

  const result = addReleaseNote(title, description);
  console.log('\nRelease note added to releases.ts');
  console.log(`   Title: ${result.title}`);
  console.log(`   Type: ${result.type}`);
  if (result.isNew) {
    console.log('   Created new "Next Release" section');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length >= 2) {
    // CLI mode: node add-release-note.js "Title" "Description" [type]
    const [title, description, type] = args;
    const result = addReleaseNote(title, description, type || 'feature');
    console.log(`Added release note: ${result.title} (${result.type})`);
  } else if (args.length === 1 && args[0] === '--help') {
    console.log(`
Usage:
  node scripts/add-release-note.js "Title" "Description" [type]
  node scripts/add-release-note.js  (interactive mode)

Arguments:
  title       Feature title (required)
  description One-sentence description (required)
  type        'feature' or 'fix' (default: feature)

Examples:
  node scripts/add-release-note.js "Dark Mode" "Toggle between light and dark themes."
  node scripts/add-release-note.js "Login Fix" "Fixed timeout issue." fix
`);
  } else {
    // Interactive mode
    await interactiveMode();
  }
}

main().catch(console.error);
