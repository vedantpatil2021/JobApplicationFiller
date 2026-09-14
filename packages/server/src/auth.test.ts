import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { ensureToken } from './auth.js'
import { createApp } from './app.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('pairing token', () => {
  it('generates a 64-char hex token on first run', async () => {
    expect(await ensureToken(dir)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns the same token on subsequent runs', async () => {
    expect(await ensureToken(dir)).toBe(await ensureToken(dir))
  })
})

describe('auth middleware', () => {
  it('rejects an /api request with no token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    await request(app).get('/api/health').expect(401)
  })

  it('rejects an /api request with the wrong token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    await request(app).get('/api/health').set('X-JAF-Token', 'nope').expect(401)
  })

  it('accepts an /api request with the right token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const res = await request(app).get('/api/health').set('X-JAF-Token', 'secret').expect(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('CORS lock', () => {
  it('reflects the controller origin', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const res = await request(app).get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('X-JAF-Token', 'secret')
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('reflects a chrome-extension origin', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
    const res = await request(app).get('/api/health')
      .set('Origin', origin)
      .set('X-JAF-Token', 'secret')
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBe(origin)
  })

  it('withholds Access-Control-Allow-Origin from a foreign site', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const res = await request(app).get('/api/health')
      .set('Origin', 'https://evil.example')
      .set('X-JAF-Token', 'secret')
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a CORS preflight from the controller without a token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-jaf-token')
    expect(res.status).toBeLessThan(400)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })
})
