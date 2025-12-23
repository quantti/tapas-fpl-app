#!/usr/bin/env node
/**
 * Post-process CSS module type files to preserve PascalCase exports.
 * tcm (typed-css-modules) converts .Header to header, but we want to keep .Header as Header.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'src';

function findDtsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findDtsFiles(fullPath));
    } else if (entry.name.endsWith('.module.css.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(dtsPath) {
  const cssPath = dtsPath.replace('.d.ts', '');
  if (!fs.existsSync(cssPath)) return;

  const cssContent = fs.readFileSync(cssPath, 'utf8');
  let dtsContent = fs.readFileSync(dtsPath, 'utf8');

  // Find all class names in CSS that start with uppercase
  const classRegex = /\.([A-Z][a-zA-Z0-9_]*)\s*[{,:\[]/g;
  let match;
  while ((match = classRegex.exec(cssContent)) !== null) {
    const originalName = match[1];
    const lowerName = originalName[0].toLowerCase() + originalName.slice(1);
    // Replace the lowercase export with the original case
    dtsContent = dtsContent.replace(
      new RegExp(`export const ${lowerName}: string;`),
      `export const ${originalName}: string;`
    );
  }

  fs.writeFileSync(dtsPath, dtsContent);
}

const files = findDtsFiles(dir);
files.forEach(fixFile);
console.log(`Fixed ${files.length} CSS module type files`);
