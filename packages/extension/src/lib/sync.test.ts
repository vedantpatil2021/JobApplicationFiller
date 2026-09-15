import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { syncProfile, describeSyncFailure } from './sync.js'
import { setCachedProfile, setSettings } from './storage.js'

beforeEach(async () => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    } },
  })
  await setSettings({ token: 'secret' })
})

describe('syncProfile', () => {
  it('fetches from the server and caches the result', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(p), { status: 200 })))

    const r = await syncProfile()
    expect(r.online).toBe(true)
    expect(r.profile!.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('sends the pairing token', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(emptyProfile()), { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await syncProfile()
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['X-JAF-Token']).toBe('secret')
  })

  it('falls back to the cached profile and reports "unreachable" when the network fails', async () => {
    const cached = emptyProfile()
    cached.applicant_profile.personal_information.first_name = 'Grace'
    await setCachedProfile(cached)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const r = await syncProfile()
    expect(r.online).toBe(false)
    expect(r.reason).toBe('unreachable')
    expect(r.profile!.applicant_profile.personal_information.first_name).toBe('Grace')
  })

  it('reports "unreachable" with a null profile when there is no cache either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await syncProfile()).toEqual({ profile: null, online: false, reason: 'unreachable' })
  })

  it('reports "unauthorized" on a 401 instead of a generic offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad token' }), { status: 401 })))
    const r = await syncProfile()
    expect(r.online).toBe(false)
    expect(r.reason).toBe('unauthorized')
  })

  it('reports "invalid-profile" when the server response fails schema validation', async () => {
    // Every field in ProfileSchema defaults when absent, so an invalid payload
    // has to give a field the WRONG type/value rather than omit one.
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ version: 2 }), { status: 200 })))
    const r = await syncProfile()
    expect(r.online).toBe(false)
    expect(r.reason).toBe('invalid-profile')
  })
})

describe('describeSyncFailure', () => {
  it('gives an actionable message per reason', () => {
    expect(describeSyncFailure('unauthorized')).toMatch(/token/i)
    expect(describeSyncFailure('invalid-profile')).toMatch(/profile\.yaml/i)
    expect(describeSyncFailure('unreachable')).toMatch(/npm run dev/i)
    expect(describeSyncFailure(undefined)).toMatch(/npm run dev/i)
  })
})
