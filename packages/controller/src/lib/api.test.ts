import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProfile, putProfile } from './api.js'
import { emptyProfile } from '@jaf/shared'

beforeEach(() => { vi.restoreAllMocks() })

describe('api client', () => {
  it('GETs /api/profile and returns the parsed body', async () => {
    const p = emptyProfile()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(p), { status: 200 })))
    expect((await getProfile()).applicant_profile).toBeDefined()
  })

  it('PUTs the profile as JSON', async () => {
    const spy = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await putProfile(emptyProfile())
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PUT')
  })

  it('throws a readable error when the server returns 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('{"error":"validation failed"}', { status: 400 })))
    await expect(putProfile(emptyProfile())).rejects.toThrow(/validation failed/)
  })

  it('does not attach the pairing token — the Vite proxy injects it', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(emptyProfile()), { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await getProfile()
    const init = spy.mock.calls[0][1] as RequestInit | undefined
    const headers = new Headers(init?.headers)
    expect(headers.has('X-JAF-Token')).toBe(false)
  })
})
