import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { createApp } from '../app.js'
import * as provider from '../ai/provider.js'

let dir: string
const TOKEN = 'test-token'
const app = () => createApp({ dataDir: dir, token: TOKEN })
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

const field: FieldDescriptor = {
  ref: 'q1', kind: 'textarea', label: 'Why do you want this job?', name: 'why',
  id: null, placeholder: null, ariaLabel: null, autocomplete: null, options: [],
  required: true, maxLength: 500, sectionIndex: 0, nearbyText: '',
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-ai-')) })
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/ai/map-fields', () => {
  it('returns AI answers for unresolved fields', async () => {
    vi.spyOn(provider, 'mapFields').mockResolvedValue({
      answers: [{ ref: 'q1', value: 'Because…', confidence: 0.85, source: 'ai' }],
    })

    const res = await auth(request(app()).post('/api/ai/map-fields')).send({
      fields: [field],
      profile: emptyProfile(),
      jobDescription: 'Build widgets',
    })

    expect(res.status).toBe(200)
    expect(res.body.answers[0].value).toBe('Because…')
  })

  it('rejects malformed bodies', async () => {
    const res = await auth(request(app()).post('/api/ai/map-fields')).send({ fields: 'nope' })
    expect(res.status).toBe(400)
  })

  it('requires the pairing token', async () => {
    const res = await request(app()).post('/api/ai/map-fields').send({
      fields: [field], profile: emptyProfile(),
    })
    expect(res.status).toBe(401)
  })

  it('surfaces CLI errors in plain language', async () => {
    vi.spyOn(provider, 'mapFields').mockResolvedValue({
      answers: [],
      error: 'Claude is not logged in — run `claude login` in a terminal.',
    })

    const res = await auth(request(app()).post('/api/ai/map-fields')).send({
      fields: [field], profile: emptyProfile(),
    })
    expect(res.body.error).toMatch(/claude login/i)
  })
})
