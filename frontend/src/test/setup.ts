import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

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
