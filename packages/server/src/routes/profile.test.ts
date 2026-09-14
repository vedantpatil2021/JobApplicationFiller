import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from '../app.js'
import { emptyProfile } from '@jaf/shared'

let dir: string
let app: ReturnType<typeof createApp>
const TOKEN = 'secret'
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jaf-'))
  app = createApp({ dataDir: dir, token: TOKEN })
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('GET /api/profile', () => {
  it('returns a default profile on a fresh data dir', async () => {
    const res = await auth(request(app).get('/api/profile')).expect(200)
    expect(res.body.applicant_profile.personal_information.first_name).toBe('')
  })
})

describe('PUT /api/profile', () => {
  it('persists a valid profile and reads it back', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    await auth(request(app).put('/api/profile')).send(p).expect(200)

    const res = await auth(request(app).get('/api/profile')).expect(200)
    expect(res.body.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('rejects an invalid profile with 400 and does not write it', async () => {
    const bad = emptyProfile()
    // Valid TypeScript (email is a string) but rejected by the zod email check.
    bad.applicant_profile.personal_information.email = 'not-an-email'
    const res = await auth(request(app).put('/api/profile')).send(bad).expect(400)
    expect(res.body.error).toBe('validation failed')

    const after = await auth(request(app).get('/api/profile')).expect(200)
    expect(after.body.applicant_profile.personal_information.email).toBe('')
  })

  it('requires the token', async () => {
    await request(app).put('/api/profile').send(emptyProfile()).expect(401)
  })
})
