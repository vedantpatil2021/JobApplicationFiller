import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { syncProfile } from './sync.js'
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

  it('falls back to the cached profile when the server is down', async () => {
    const cached = emptyProfile()
    cached.applicant_profile.personal_information.first_name = 'Grace'
    await setCachedProfile(cached)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const r = await syncProfile()
    expect(r.online).toBe(false)
    expect(r.profile!.applicant_profile.personal_information.first_name).toBe('Grace')
  })

  it('reports offline with a null profile when there is no cache either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await syncProfile()).toEqual({ profile: null, online: false })
  })
})
