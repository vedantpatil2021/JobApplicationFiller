import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { getSettings, setSettings, getCachedProfile, setCachedProfile } from './storage.js'

beforeEach(() => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    } },
  })
})

describe('extension storage', () => {
  it('returns usable defaults before anything is saved', async () => {
    const s = await getSettings()
    expect(s.serverUrl).toBe('http://127.0.0.1:4321')
    expect(s.token).toBe('')
  })

  it('persists a partial settings update without clobbering the rest', async () => {
    await setSettings({ token: 'abc' })
    await setSettings({ lastSyncedAt: 42 })
    const s = await getSettings()
    expect(s.token).toBe('abc')
    expect(s.lastSyncedAt).toBe(42)
  })

  it('returns null when no profile is cached yet', async () => {
    expect(await getCachedProfile()).toBeNull()
  })

  it('round-trips the cached profile so autofill survives the server going away', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    await setCachedProfile(p)
    expect((await getCachedProfile())!.applicant_profile.personal_information.first_name).toBe('Ada')
  })
})
