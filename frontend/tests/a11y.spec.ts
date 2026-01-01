/**
 * Accessibility tests using axe-core.
 * Tests all pages for WCAG 2.1 Level AA compliance.
 */
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

const pages = [
  { path: '/', name: 'Dashboard' },
  { path: '/statistics', name: 'Statistics' },
  { path: '/analytics', name: 'Analytics' },
]

test.describe('Accessibility', () => {
  for (const { path, name } of pages) {
    test(`${name} page should have no critical a11y violations`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()

      // Log violations for debugging
      if (results.violations.length > 0) {
        console.log(`\n${name} page violations:`)
        for (const violation of results.violations) {
          console.log(`  - ${violation.id}: ${violation.description}`)
          console.log(`    Impact: ${violation.impact}`)
          console.log(`    Nodes: ${violation.nodes.length}`)
        }
      }

      expect(results.violations).toEqual([])
    })
  }
})
