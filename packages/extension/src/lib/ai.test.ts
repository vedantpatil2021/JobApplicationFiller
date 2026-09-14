import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { mapFieldsViaServer } from './ai.js'
import { setSettings } from './storage.js'

const field: FieldDescriptor = {
  ref: 'q1', kind: 'textarea', label: 'Why?', name: 'why',
  id: null, placeholder: null, ariaLabel: null, autocomplete: null, options: [],
  required: true, maxLength: null, sectionIndex: 0, nearbyText: '',
}

beforeEach(async () => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    } },
  })
  await setSettings({ token: 'secret', serverUrl: 'http://127.0.0.1:4321' })
})

describe('mapFieldsViaServer', () => {
  it('posts unresolved fields to the server with the pairing token', async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ answers: [{ ref: 'q1', value: 'Hi', confidence: 0.9, source: 'ai' }] }), { status: 200 }))
    vi.stubGlobal('fetch', spy)

    const r = await mapFieldsViaServer([field], emptyProfile(), 'JD text')
    expect(r.answers[0].value).toBe('Hi')
    expect((spy.mock.calls[0][1]?.headers as Record<string, string>)['X-JAF-Token']).toBe('secret')
  })

  it('returns a plain error when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const r = await mapFieldsViaServer([field], emptyProfile(), '')
    expect(r.error).toMatch(/could not reach/i)
  })
})
