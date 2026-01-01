import { describe, it, expect } from 'vitest'

import { FplApiError } from './api'

const SERVICE_UNAVAILABLE = 'Service Unavailable'

describe('FplApiError', () => {
  it('creates error with status code and message', () => {
    const error = new FplApiError(503, SERVICE_UNAVAILABLE)

    expect(error.status).toBe(503)
    expect(error.statusText).toBe(SERVICE_UNAVAILABLE)
    expect(error.message).toBe(`API error: 503 ${SERVICE_UNAVAILABLE}`)
    expect(error.name).toBe('FplApiError')
  })

  it('detects 503 as service unavailable', () => {
    const error503 = new FplApiError(503, SERVICE_UNAVAILABLE)
    expect(error503.isServiceUnavailable).toBe(true)

    const error404 = new FplApiError(404, 'Not Found')
    expect(error404.isServiceUnavailable).toBe(false)

    const error500 = new FplApiError(500, 'Internal Server Error')
    expect(error500.isServiceUnavailable).toBe(false)
  })

  it('extends Error class', () => {
    const error = new FplApiError(503, SERVICE_UNAVAILABLE)
    expect(error).toBeInstanceOf(Error)
  })
})
