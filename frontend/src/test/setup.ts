import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

// Mock HTMLDialogElement methods (not supported in jsdom)
HTMLDialogElement.prototype.showModal = vi.fn()
HTMLDialogElement.prototype.close = vi.fn()

// Fail tests on React act() warnings
// These warnings indicate improper async handling and can cause flaky tests
beforeAll(() => {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message === 'string' && message.includes('was not wrapped in act')) {
      throw new Error(`React act() warning detected - this causes test flakiness:\n${message}`)
    }
    originalError.apply(console, args)
  }
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock CSS modules
vi.mock('*.module.css', () => ({
  default: new Proxy(
    {},
    {
      get: (_, prop) => prop,
    }
  ),
}))
